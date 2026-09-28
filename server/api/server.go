// Package api implements the QRForge REST API (/api/v1) and wires the
// redirect service and web UI into a single http.Handler.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/kspkr/QrForge/server/analytics"
	"github.com/kspkr/QrForge/server/auth"
	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/redirect"
	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/settings"
	"github.com/kspkr/QrForge/server/storage"
	"github.com/kspkr/QrForge/server/web"
)

// Server holds dependencies shared by all handlers.
type Server struct {
	Cfg      *config.Config
	DB       *storage.DB
	Auth     *auth.Service
	Settings *settings.Store
	Recorder *analytics.Recorder
	Mailer   *auth.Mailer
	Log      *slog.Logger
	OpenAPI  []byte

	// LookupTXT resolves DNS TXT records for custom-domain verification.
	LookupTXT func(ctx context.Context, name string) ([]string, error)

	started    time.Time
	ipLimit    *security.Limiter
	keyLimit   *security.Limiter
	authLimit  *security.Limiter
	emailLimit *security.Limiter
	abuseLimit *security.Limiter
	redirect   *redirect.Handler
}

// New builds a server. openapi may be nil.
func New(cfg *config.Config, db *storage.DB, st *settings.Store, log *slog.Logger, openapi []byte) *Server {
	rl := cfg.RateLimits
	s := &Server{
		Cfg:        cfg,
		DB:         db,
		Auth:       auth.NewService(db, cfg.BcryptCost, cfg.SessionTTL),
		Settings:   st,
		Recorder:   analytics.NewRecorder(db),
		Mailer:     auth.NewMailer(cfg.SMTP),
		Log:        log,
		OpenAPI:    openapi,
		LookupTXT:  net.DefaultResolver.LookupTXT,
		started:    time.Now(),
		ipLimit:    security.NewLimiter(rl.APIPerIP, time.Minute),
		keyLimit:   security.NewLimiter(rl.APIKeyPerMinute, time.Minute),
		authLimit:  security.NewLimiter(rl.AuthPerIP, time.Minute),
		emailLimit: security.NewLimiter(rl.LoginPerEmail, time.Hour),
		abuseLimit: security.NewLimiter(rl.AbusePerHour, time.Hour),
	}
	s.redirect = &redirect.Handler{
		DB:                db,
		Config:            cfg,
		Settings:          st,
		Recorder:          s.Recorder,
		RedirectLimit:     security.NewLimiter(rl.RedirectPerIP, time.Minute),
		PasswordLimit:     security.NewLimiter(rl.PasswordPerIP, time.Minute),
		CodePasswordLimit: security.NewLimiter(rl.PasswordPerCode, time.Hour),
		Log:               log,
	}
	return s
}

// principal is the authenticated caller.
type principal struct {
	User    *storage.User
	Session *storage.Session
	APIKey  *storage.APIKey
}

type ctxKey struct{}

// handlerFunc is an API handler with the resolved principal (nil if anonymous).
type handlerFunc func(w http.ResponseWriter, r *http.Request, p *principal) error

type access int

const (
	public access = iota
	userOrKey
	sessionOnly
	adminOnly
)

func (s *Server) clientIP(r *http.Request) string { return security.ClientIP(r, s.Cfg.TrustedProxies) }

// rateKey is the per-client rate-limit key (IPv6 clients are grouped by /64).
func (s *Server) rateKey(r *http.Request) string { return security.IPKey(s.clientIP(r)) }

// wrap applies authentication, CSRF and access rules, then renders errors.
func (s *Server) wrap(level access, h handlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, _ := r.Context().Value(ctxKey{}).(*principal)
		err := func() error {
			switch level {
			case userOrKey:
				if p == nil {
					return errUnauthorized
				}
			case sessionOnly, adminOnly:
				if p == nil {
					return errUnauthorized
				}
				if p.Session == nil {
					return errorf(http.StatusForbidden, "forbidden", "This endpoint requires a browser session; API keys are not accepted.")
				}
				if level == adminOnly && !p.User.IsAdmin() {
					return errForbidden
				}
			}
			if p != nil && p.Session != nil && isUnsafe(r.Method) {
				if !security.Equal(r.Header.Get("X-CSRF-Token"), p.Session.CSRFToken) {
					return errCSRF
				}
			}
			return h(w, r, p)
		}()
		if err != nil {
			s.renderError(w, r, err)
		}
	})
}

func (s *Server) renderError(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if errors.As(err, &e) {
		writeError(w, e)
		return
	}
	switch {
	case errors.Is(err, storage.ErrNotFound):
		writeError(w, errNotFound)
	case errors.Is(err, storage.ErrConflict):
		writeError(w, errorf(http.StatusConflict, "conflict", "The resource already exists."))
	default:
		s.Log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeError(w, errInternal)
	}
}

func isUnsafe(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

// apiMiddleware applies body limits, IP rate limits, origin checks and
// resolves the principal for every /api request.
func (s *Server) apiMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, s.Cfg.MaxBodyBytes)
		if r.ContentLength > s.Cfg.MaxBodyBytes {
			writeError(w, errorf(http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large."))
			return
		}
		if ok, wait := s.ipLimit.Allow(s.rateKey(r)); !ok {
			writeError(w, rateLimited(wait))
			return
		}

		var p *principal
		if authz := r.Header.Get("Authorization"); authz != "" {
			scheme, token, _ := strings.Cut(authz, " ")
			if !strings.EqualFold(scheme, "Bearer") {
				writeError(w, errorf(http.StatusUnauthorized, "unauthorized", "Use 'Authorization: Bearer <api key>'."))
				return
			}
			key, user, err := s.Auth.ResolveAPIKey(r.Context(), strings.TrimSpace(token))
			if err != nil {
				if errors.Is(err, auth.ErrDisabled) {
					writeError(w, errorf(http.StatusForbidden, "account_disabled", "This account has been disabled."))
					return
				}
				writeError(w, errorf(http.StatusUnauthorized, "unauthorized", "Invalid API key."))
				return
			}
			if ok, wait := s.keyLimit.Allow(key.ID); !ok {
				writeError(w, rateLimited(wait))
				return
			}
			p = &principal{User: user, APIKey: key}
		} else {
			if isUnsafe(r.Method) && !s.originAllowed(r) {
				writeError(w, errorf(http.StatusForbidden, "csrf_failed", "Cross-origin request rejected."))
				return
			}
			if c, err := r.Cookie(auth.SessionCookie); err == nil {
				if sess, user, err := s.Auth.ResolveSession(r.Context(), c.Value); err == nil {
					p = &principal{User: user, Session: sess}
				}
			}
		}
		if p != nil {
			r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, p))
		}
		next.ServeHTTP(w, r)
	})
}

// originAllowed rejects browser requests whose Origin is a different site.
func (s *Server) originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.EqualFold(u.Host, r.Host) || strings.EqualFold(u.Host, s.Cfg.BaseURL.Host)
}

// Handler returns the complete HTTP handler (API, redirects, web UI).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	api := http.NewServeMux()
	s.routes(api)
	mux.Handle("/api/", s.apiMiddleware(api))

	mux.HandleFunc("GET /r/{slug}", s.redirect.Serve)
	mux.HandleFunc("POST /r/{slug}", s.redirect.Unlock)

	if s.Cfg.WebDir != "" {
		mux.Handle("/", web.Handler(s.Cfg.WebDir))
	} else {
		mux.Handle("/", web.Placeholder())
	}
	return s.recoverer(s.logRequests(security.Headers(s.Cfg.BaseURL.Scheme == "https", mux)))
}

func (s *Server) routes(m *http.ServeMux) {
	const v = "/api/v1"
	h := func(pattern string, level access, fn handlerFunc) {
		method, path, _ := strings.Cut(pattern, " ")
		m.Handle(method+" "+v+path, s.wrap(level, fn))
	}

	h("GET /health", public, s.health)
	h("GET /config", public, s.publicConfig)
	m.HandleFunc("GET "+v+"/openapi.yaml", s.openapi)

	h("POST /auth/register", public, s.register)
	h("POST /auth/login", public, s.login)
	h("POST /auth/logout", public, s.logout)
	h("GET /auth/me", userOrKey, s.me)
	h("PATCH /auth/me", sessionOnly, s.updateMe)
	h("POST /auth/password/change", sessionOnly, s.changePassword)
	h("POST /auth/password/forgot", public, s.forgotPassword)
	h("POST /auth/password/reset", public, s.resetPassword)

	h("POST /qrcodes", userOrKey, s.createQRCode)
	h("GET /qrcodes", userOrKey, s.listQRCodes)
	h("GET /qrcodes/{id}", userOrKey, s.getQRCode)
	h("PATCH /qrcodes/{id}", userOrKey, s.updateQRCode)
	h("DELETE /qrcodes/{id}", userOrKey, s.deleteQRCode)
	h("POST /qrcodes/{id}/rotate-slug", userOrKey, s.rotateSlug)
	h("POST /qrcodes/{id}/duplicate", userOrKey, s.duplicateQRCode)
	h("GET /qrcodes/{id}/history", userOrKey, s.qrHistory)
	h("GET /qrcodes/{id}/analytics", userOrKey, s.qrAnalytics)
	h("GET /analytics/overview", userOrKey, s.analyticsOverview)

	h("GET /campaigns", userOrKey, s.listCampaigns)
	h("POST /campaigns", userOrKey, s.createCampaign)
	h("GET /campaigns/{id}", userOrKey, s.getCampaign)
	h("PATCH /campaigns/{id}", userOrKey, s.updateCampaign)
	h("DELETE /campaigns/{id}", userOrKey, s.deleteCampaign)
	h("GET /campaigns/{id}/analytics", userOrKey, s.campaignAnalytics)

	h("GET /domains", userOrKey, s.listDomains)
	h("POST /domains", sessionOnly, s.createDomain)
	h("DELETE /domains/{id}", sessionOnly, s.deleteDomain)
	h("POST /domains/{id}/verify", sessionOnly, s.verifyDomain)
	h("GET /domains/check", public, s.checkDomain)

	h("GET /api-keys", sessionOnly, s.listAPIKeys)
	h("POST /api-keys", sessionOnly, s.createAPIKey)
	h("DELETE /api-keys/{id}", sessionOnly, s.deleteAPIKey)

	h("GET /audit-log", userOrKey, s.auditLog)
	h("POST /abuse-reports", public, s.createAbuseReport)

	h("GET /admin/overview", adminOnly, s.adminOverview)
	h("GET /admin/users", adminOnly, s.adminListUsers)
	h("PATCH /admin/users/{id}", adminOnly, s.adminUpdateUser)
	h("GET /admin/qrcodes", adminOnly, s.adminListQRCodes)
	h("PATCH /admin/qrcodes/{id}", adminOnly, s.adminUpdateQRCode)
	h("GET /admin/abuse-reports", adminOnly, s.adminListAbuse)
	h("PATCH /admin/abuse-reports/{id}", adminOnly, s.adminUpdateAbuse)
	h("GET /admin/settings", adminOnly, s.adminGetSettings)
	h("PATCH /admin/settings", adminOnly, s.adminUpdateSettings)
	h("GET /admin/audit-log", adminOnly, s.adminAuditLog)

	m.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, errorf(http.StatusNotFound, "not_found", "Unknown API endpoint."))
	}))
}

func (s *Server) openapi(w http.ResponseWriter, r *http.Request) {
	if len(s.OpenAPI) == 0 {
		writeError(w, errNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(s.OpenAPI)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		// Only the path is logged: query strings can carry tokens.
		s.Log.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status,
			"duration_ms", time.Since(start).Milliseconds())
	})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if rec == http.ErrAbortHandler {
					panic(rec)
				}
				s.Log.Error("panic", "err", rec, "path", r.URL.Path)
				writeError(w, errInternal)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// audit records an event; failures are logged but never fail the request.
func (s *Server) audit(ctx context.Context, p *principal, action, targetType, targetID string, meta map[string]any) {
	e := &storage.AuditEvent{Action: action, TargetType: targetType, TargetID: targetID}
	if p != nil && p.User != nil {
		id := p.User.ID
		e.ActorID = &id
		e.ActorEmail = p.User.Email
		if p.APIKey != nil {
			if meta == nil {
				meta = map[string]any{}
			}
			meta["api_key"] = p.APIKey.Prefix
		}
	}
	if meta != nil {
		if b, err := json.Marshal(meta); err == nil {
			e.Metadata = string(b)
		}
	}
	if err := s.DB.InsertAudit(context.WithoutCancel(ctx), e); err != nil {
		s.Log.Warn("audit log write failed", "action", action, "err", err)
	}
}
