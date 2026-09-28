// Package redirect serves dynamic QR code redirects (/r/{slug}).
//
// Redirects are the public face of QRForge, so they are defensive: every
// destination is re-validated against the current abuse policy at redirect
// time, disabled/expired codes stop resolving immediately, responses are
// never cached, and analytics recording can never break a redirect.
package redirect

import (
	"context"
	"encoding/json"
	"errors"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/kspkr/QrForge/server/analytics"
	"github.com/kspkr/QrForge/server/auth"
	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/settings"
	"github.com/kspkr/QrForge/server/storage"
)

// Handler serves redirect routes.
type Handler struct {
	DB            *storage.DB
	Config        *config.Config
	Settings      *settings.Store
	Recorder      *analytics.Recorder
	RedirectLimit *security.Limiter
	PasswordLimit *security.Limiter
	// CodePasswordLimit caps password attempts per code across all clients,
	// so a distributed guesser can't brute-force one protected link.
	CodePasswordLimit *security.Limiter
	Log               *slog.Logger
}

// UTM holds campaign parameters appended to destinations.
type UTM struct {
	Source   string `json:"source,omitempty"`
	Medium   string `json:"medium,omitempty"`
	Campaign string `json:"campaign,omitempty"`
	Term     string `json:"term,omitempty"`
	Content  string `json:"content,omitempty"`
}

// MergeUTM appends utm_* parameters that are not already present in the
// destination's query string. Existing parameters and ordering are preserved.
func MergeUTM(dest string, utm UTM) string {
	pairs := []struct{ key, val string }{
		{"utm_source", utm.Source}, {"utm_medium", utm.Medium}, {"utm_campaign", utm.Campaign},
		{"utm_term", utm.Term}, {"utm_content", utm.Content},
	}
	u, err := url.Parse(dest)
	if err != nil {
		return dest
	}
	existing := u.Query()
	var add []string
	for _, p := range pairs {
		if p.val == "" || existing.Has(p.key) {
			continue
		}
		add = append(add, url.QueryEscape(p.key)+"="+url.QueryEscape(p.val))
	}
	if len(add) == 0 {
		return dest
	}
	if u.RawQuery == "" {
		u.RawQuery = strings.Join(add, "&")
	} else {
		u.RawQuery += "&" + strings.Join(add, "&")
	}
	return u.String()
}

func requestHost(r *http.Request) string {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSuffix(strings.ToLower(host), ".")
}

type lookupResult int

const (
	found lookupResult = iota
	notFound
	disabled
	expired
	blockedDest
)

// lookup resolves a slug to an active code, honouring custom-domain scoping.
func (h *Handler) lookup(ctx context.Context, r *http.Request, slug string) (*storage.QRCode, lookupResult, error) {
	if slug == "" || len(slug) > 64 {
		return nil, notFound, nil
	}
	q, err := h.DB.GetQRCodeBySlug(ctx, slug)
	if errors.Is(err, storage.ErrNotFound) {
		return nil, notFound, nil
	}
	if err != nil {
		return nil, notFound, err
	}
	if q.Kind != "dynamic" || q.Destination == nil {
		return nil, notFound, nil
	}
	if host := requestHost(r); host != h.Config.BaseHost() {
		if d, err := h.DB.GetDomainByHostname(ctx, host); err == nil && d.Verified {
			if q.DomainID == nil || *q.DomainID != d.ID {
				return nil, notFound, nil
			}
		}
	}
	if q.Status != "active" || q.OwnerDisabled {
		return q, disabled, nil
	}
	if q.ExpiresAt != nil && *q.ExpiresAt <= time.Now().Unix() {
		return q, expired, nil
	}
	if _, err := h.Settings.Policy(h.Config.BaseHost()).ValidateDestination(*q.Destination); err != nil {
		return q, blockedDest, nil
	}
	return q, found, nil
}

func (h *Handler) rateLimited(w http.ResponseWriter, r *http.Request, l *security.Limiter) bool {
	if l == nil {
		return false
	}
	ok, wait := l.Allow(security.IPKey(security.ClientIP(r, h.Config.TrustedProxies)))
	if ok {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
	h.page(w, http.StatusTooManyRequests, pageData{Title: "Slow down", Message: "Too many requests. Please wait a moment and try again."})
	return true
}

// Serve handles GET/HEAD /r/{slug}.
func (h *Handler) Serve(w http.ResponseWriter, r *http.Request) {
	setNoStore(w)
	if h.rateLimited(w, r, h.RedirectLimit) {
		return
	}
	slug := r.PathValue("slug")
	q, res, err := h.lookup(r.Context(), r, slug)
	if err != nil {
		h.Log.Error("redirect lookup failed", "err", err)
		h.page(w, http.StatusInternalServerError, pageData{Title: "Something went wrong", Message: "Please try again later."})
		return
	}
	if h.renderFailure(w, res, slug) {
		return
	}
	if q.PasswordHash != nil {
		h.page(w, http.StatusOK, pageData{Title: "Protected link", Message: "Enter the password to continue.", Slug: slug, Password: true})
		return
	}
	h.redirect(w, r, q)
}

// Unlock handles POST /r/{slug} for password-protected codes.
func (h *Handler) Unlock(w http.ResponseWriter, r *http.Request) {
	setNoStore(w)
	if h.rateLimited(w, r, h.PasswordLimit) {
		return
	}
	slug := r.PathValue("slug")
	q, res, err := h.lookup(r.Context(), r, slug)
	if err != nil {
		h.Log.Error("redirect lookup failed", "err", err)
		h.page(w, http.StatusInternalServerError, pageData{Title: "Something went wrong", Message: "Please try again later."})
		return
	}
	if h.renderFailure(w, res, slug) {
		return
	}
	if q.PasswordHash == nil {
		h.redirect(w, r, q)
		return
	}
	if h.CodePasswordLimit != nil {
		if ok, wait := h.CodePasswordLimit.Allow(q.ID); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			h.page(w, http.StatusTooManyRequests, pageData{Title: "Slow down", Message: "Too many password attempts for this link. Please try again later."})
			return
		}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := r.ParseForm(); err != nil || !auth.CheckPassword(*q.PasswordHash, r.PostFormValue("password")) {
		h.page(w, http.StatusUnauthorized, pageData{Title: "Protected link", Message: "Enter the password to continue.", Slug: slug, Password: true, Error: "Incorrect password."})
		return
	}
	h.redirect(w, r, q)
}

func (h *Handler) renderFailure(w http.ResponseWriter, res lookupResult, slug string) bool {
	switch res {
	case notFound:
		h.page(w, http.StatusNotFound, pageData{Title: "QR code not found", Message: "This link does not exist or is no longer available."})
	case disabled:
		h.page(w, http.StatusGone, pageData{Title: "QR code disabled", Message: "This QR code has been disabled.", Slug: slug})
	case expired:
		h.page(w, http.StatusGone, pageData{Title: "QR code expired", Message: "This QR code has expired.", Slug: slug})
	case blockedDest:
		h.page(w, http.StatusGone, pageData{Title: "Link unavailable", Message: "This link's destination is not allowed on this server.", Slug: slug})
	default:
		return false
	}
	return true
}

func (h *Handler) redirect(w http.ResponseWriter, r *http.Request, q *storage.QRCode) {
	dest := *q.Destination
	if q.UTM != nil {
		var utm UTM
		if json.Unmarshal([]byte(*q.UTM), &utm) == nil {
			dest = MergeUTM(dest, utm)
		}
	}
	if r.Method != http.MethodHead && q.AnalyticsEnabled && !analytics.IsBot(r.UserAgent()) {
		country := ""
		if h.Config.CountryHeader != "" {
			country = r.Header.Get(h.Config.CountryHeader)
		}
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 3*time.Second)
		err := h.Recorder.Record(ctx, analytics.ScanInput{
			QRCodeID:  q.ID,
			IP:        security.ClientIP(r, h.Config.TrustedProxies),
			UserAgent: r.UserAgent(),
			Referrer:  r.Referer(),
			Country:   country,
		})
		cancel()
		if err != nil {
			// Analytics must never break a redirect.
			h.Log.Warn("failed to record scan", "qrcode_id", q.ID, "err", err)
		}
	}
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	http.Redirect(w, r, dest, http.StatusFound)
}

func setNoStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
}

type pageData struct {
	Title    string
	Message  string
	Slug     string
	Password bool
	Error    string
}

var pageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{{.Title}} · QRForge</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#18181b;--muted:#71717a;--card:#fff;--border:#e4e4e7;--accent:#ea4d12}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--card:#18181b;--border:#27272a;--accent:#ff6a2b}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:28px}
h1{font-size:19px;margin:0 0 6px}p{margin:0 0 16px;color:var(--muted)}
form{display:grid;gap:10px}input{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--border);background:transparent;color:inherit;font:inherit}
button{padding:10px 12px;border:0;border-radius:9px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:#dc2626;font-size:14px;margin:0}footer{margin-top:20px;font-size:13px;color:var(--muted);display:flex;justify-content:space-between}
a{color:var(--muted)}
</style></head><body><main>
<h1>{{.Title}}</h1><p>{{.Message}}</p>
{{if .Password}}<form method="post" autocomplete="off">
{{if .Error}}<p class="err" role="alert">{{.Error}}</p>{{end}}
<label for="pw" style="position:absolute;left:-9999px">Password</label>
<input id="pw" type="password" name="password" required autofocus maxlength="72" placeholder="Password">
<button type="submit">Continue</button></form>{{end}}
<footer><span>Powered by QRForge</span>{{if .Slug}}<a href="/report?slug={{.Slug}}">Report abuse</a>{{end}}</footer>
</main></body></html>`))

func (h *Handler) page(w http.ResponseWriter, status int, data pageData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := pageTemplate.Execute(w, data); err != nil {
		h.Log.Warn("render redirect page", "err", err)
	}
}
