package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kspkr/QrForge/server/analytics"
	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

// ---------------------------------------------------------------------------
// Campaigns

type campaignJSON struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Color       *string `json:"color"`
	QRCount     int64   `json:"qr_count"`
	ScanCount   int64   `json:"scan_count"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func toCampaignJSON(c *storage.Campaign) campaignJSON {
	return campaignJSON{c.ID, c.Name, c.Description, c.Color, c.QRCount, c.ScanCount, ts(c.CreatedAt), ts(c.UpdatedAt)}
}

func applyCampaign(c *storage.Campaign, fields map[string]json.RawMessage) error {
	errs := map[string]string{}
	for key, raw := range fields {
		switch key {
		case "name":
			v, ok := str(raw)
			v = strings.TrimSpace(v)
			if !ok || v == "" || utf8.RuneCountInString(v) > 100 {
				errs["name"] = "must be a non-empty string of at most 100 characters"
				continue
			}
			c.Name = v
		case "description":
			if isNull(raw) {
				c.Description = ""
				continue
			}
			v, ok := str(raw)
			if !ok || utf8.RuneCountInString(v) > 500 {
				errs["description"] = "must be a string of at most 500 characters"
				continue
			}
			c.Description = strings.TrimSpace(v)
		case "color":
			if isNull(raw) {
				c.Color = nil
				continue
			}
			v, ok := str(raw)
			if !ok || !colorRegex.MatchString(v) {
				errs["color"] = "must be a hex colour like #4f46e5 or null"
				continue
			}
			v = strings.ToLower(v)
			c.Color = &v
		}
	}
	if len(errs) > 0 {
		return validation(errs)
	}
	return nil
}

func (s *Server) listCampaigns(w http.ResponseWriter, r *http.Request, p *principal) error {
	pg := parsePage(r)
	items, total, err := s.DB.ListCampaigns(r.Context(), p.User.ID, pg.PerPage, pg.offset())
	if err != nil {
		return err
	}
	out := make([]campaignJSON, 0, len(items))
	for _, c := range items {
		out = append(out, toCampaignJSON(c))
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) createCampaign(w http.ResponseWriter, r *http.Request, p *principal) error {
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	c := &storage.Campaign{UserID: p.User.ID}
	if err := applyCampaign(c, fields); err != nil {
		return err
	}
	if c.Name == "" {
		return fieldError("name", "is required")
	}
	if err := s.DB.CreateCampaign(r.Context(), c); err != nil {
		return err
	}
	s.audit(r.Context(), p, "campaign.create", "campaign", c.ID, nil)
	writeJSON(w, http.StatusCreated, toCampaignJSON(c))
	return nil
}

func (s *Server) getCampaign(w http.ResponseWriter, r *http.Request, p *principal) error {
	c, err := s.DB.GetCampaign(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, toCampaignJSON(c))
	return nil
}

func (s *Server) updateCampaign(w http.ResponseWriter, r *http.Request, p *principal) error {
	c, err := s.DB.GetCampaign(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	if err := applyCampaign(c, fields); err != nil {
		return err
	}
	if err := s.DB.UpdateCampaign(r.Context(), c); err != nil {
		return err
	}
	s.audit(r.Context(), p, "campaign.update", "campaign", c.ID, nil)
	writeJSON(w, http.StatusOK, toCampaignJSON(c))
	return nil
}

func (s *Server) deleteCampaign(w http.ResponseWriter, r *http.Request, p *principal) error {
	id := r.PathValue("id")
	if err := s.DB.DeleteCampaign(r.Context(), id, p.User.ID); err != nil {
		return err
	}
	s.audit(r.Context(), p, "campaign.delete", "campaign", id, nil)
	noContent(w)
	return nil
}

func (s *Server) campaignAnalytics(w http.ResponseWriter, r *http.Request, p *principal) error {
	c, err := s.DB.GetCampaign(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	key, err := rangeParam(r)
	if err != nil {
		return err
	}
	now := time.Now()
	scope := analytics.ForCampaign(c.ID)
	rep, err := analytics.Build(r.Context(), s.DB, scope, key, now)
	if err != nil {
		return err
	}
	from, _, err := analytics.Window(r.Context(), s.DB, scope, key, now)
	if err != nil {
		return err
	}
	per, err := s.DB.CampaignQRScans(r.Context(), c.ID, from)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, struct {
		*analytics.Report
		PerQRCode []namedCountJSON `json:"per_qrcode"`
	}{rep, toNamedCounts(per)})
	return nil
}

// ---------------------------------------------------------------------------
// Custom domains

const verificationPrefix = "qrforge-verify="

type domainJSON struct {
	ID                 string            `json:"id"`
	Hostname           string            `json:"hostname"`
	Verified           bool              `json:"verified"`
	VerificationRecord map[string]string `json:"verification_record"`
	CreatedAt          string            `json:"created_at"`
	VerifiedAt         *string           `json:"verified_at"`
}

func verificationName(host string) string { return "_qrforge-challenge." + host }

func toDomainJSON(d *storage.Domain) domainJSON {
	return domainJSON{
		ID: d.ID, Hostname: d.Hostname, Verified: d.Verified,
		VerificationRecord: map[string]string{
			"type":  "TXT",
			"name":  verificationName(d.Hostname),
			"value": verificationPrefix + d.VerificationToken,
		},
		CreatedAt: ts(d.CreatedAt), VerifiedAt: tsPtr(d.VerifiedAt),
	}
}

func (s *Server) listDomains(w http.ResponseWriter, r *http.Request, p *principal) error {
	items, err := s.DB.ListDomains(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	out := make([]domainJSON, 0, len(items))
	for _, d := range items {
		out = append(out, toDomainJSON(d))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
	return nil
}

// staleDomainClaim is how long an unverified domain claim blocks other users.
const staleDomainClaim = 24 * time.Hour

func (s *Server) createDomain(w http.ResponseWriter, r *http.Request, p *principal) error {
	var in struct {
		Hostname string `json:"hostname"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	host, err := security.NormalizeHostname(in.Hostname)
	if err != nil {
		return fieldError("hostname", err.Error())
	}
	if host == s.Cfg.BaseHost() {
		return fieldError("hostname", "is already this server's primary domain")
	}
	existing, err := s.DB.ListDomains(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	if len(existing) >= 25 {
		return errorf(http.StatusForbidden, "limit_reached", "You can register at most 25 custom domains.")
	}
	d := &storage.Domain{UserID: p.User.ID, Hostname: host, VerificationToken: security.RandomToken(18)}
	err = s.DB.CreateDomain(r.Context(), d)
	if errors.Is(err, storage.ErrConflict) {
		// An unverified claim older than a day can be taken over, otherwise
		// anyone could permanently block a domain they don't control.
		released, relErr := s.DB.ReleaseStaleDomainClaim(r.Context(), host, time.Now().Add(-staleDomainClaim).Unix())
		if relErr != nil {
			return relErr
		}
		if released {
			d = &storage.Domain{UserID: p.User.ID, Hostname: host, VerificationToken: security.RandomToken(18)}
			err = s.DB.CreateDomain(r.Context(), d)
		}
	}
	if err != nil {
		if errors.Is(err, storage.ErrConflict) {
			return errorf(http.StatusConflict, "conflict", "This domain is already registered.")
		}
		return err
	}
	s.audit(r.Context(), p, "domain.create", "domain", d.ID, map[string]any{"hostname": host})
	writeJSON(w, http.StatusCreated, toDomainJSON(d))
	return nil
}

func (s *Server) deleteDomain(w http.ResponseWriter, r *http.Request, p *principal) error {
	id := r.PathValue("id")
	if err := s.DB.DeleteDomain(r.Context(), id, p.User.ID); err != nil {
		return err
	}
	s.audit(r.Context(), p, "domain.delete", "domain", id, nil)
	noContent(w)
	return nil
}

func (s *Server) verifyDomain(w http.ResponseWriter, r *http.Request, p *principal) error {
	d, err := s.DB.GetDomain(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	if !d.Verified {
		records, err := s.LookupTXT(r.Context(), verificationName(d.Hostname))
		want := verificationPrefix + d.VerificationToken
		ok := false
		if err == nil {
			for _, rec := range records {
				if security.Equal(strings.TrimSpace(rec), want) {
					ok = true
					break
				}
			}
		}
		if !ok {
			return errorf(http.StatusUnprocessableEntity, "verification_failed",
				"TXT record "+verificationName(d.Hostname)+" with value "+want+" was not found. DNS changes can take a while to propagate.")
		}
		if err := s.DB.SetDomainVerified(r.Context(), d.ID); err != nil {
			return err
		}
		s.audit(r.Context(), p, "domain.verify", "domain", d.ID, map[string]any{"hostname": d.Hostname})
		d, err = s.DB.GetDomain(r.Context(), d.ID, p.User.ID)
		if err != nil {
			return err
		}
	}
	writeJSON(w, http.StatusOK, toDomainJSON(d))
	return nil
}

// ---------------------------------------------------------------------------
// API keys

type apiKeyJSON struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	LastUsedAt *string `json:"last_used_at"`
	UsageCount int64   `json:"usage_count"`
	CreatedAt  string  `json:"created_at"`
}

func toAPIKeyJSON(k *storage.APIKey) apiKeyJSON {
	return apiKeyJSON{k.ID, k.Name, k.Prefix, tsPtr(k.LastUsedAt), k.UsageCount, ts(k.CreatedAt)}
}

func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request, p *principal) error {
	keys, err := s.DB.ListAPIKeys(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	out := make([]apiKeyJSON, 0, len(keys))
	for _, k := range keys {
		out = append(out, toAPIKeyJSON(k))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
	return nil
}

func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request, p *principal) error {
	var in struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || utf8.RuneCountInString(name) > 100 {
		return fieldError("name", "must be a non-empty string of at most 100 characters")
	}
	keys, err := s.DB.ListAPIKeys(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	if len(keys) >= 50 {
		return errorf(http.StatusForbidden, "limit_reached", "You can have at most 50 API keys.")
	}
	k, plain, err := s.Auth.NewAPIKey(r.Context(), p.User.ID, name)
	if err != nil {
		return err
	}
	s.audit(r.Context(), p, "api_key.create", "api_key", k.ID, map[string]any{"prefix": k.Prefix})
	writeJSON(w, http.StatusCreated, map[string]any{"api_key": toAPIKeyJSON(k), "key": plain})
	return nil
}

func (s *Server) deleteAPIKey(w http.ResponseWriter, r *http.Request, p *principal) error {
	id := r.PathValue("id")
	if err := s.DB.DeleteAPIKey(r.Context(), p.User.ID, id); err != nil {
		return err
	}
	s.audit(r.Context(), p, "api_key.delete", "api_key", id, nil)
	noContent(w)
	return nil
}

// ---------------------------------------------------------------------------
// Audit log

type auditJSON struct {
	ID         string          `json:"id"`
	Action     string          `json:"action"`
	ActorID    *string         `json:"actor_id"`
	ActorEmail string          `json:"actor_email"`
	TargetType string          `json:"target_type"`
	TargetID   string          `json:"target_id"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  string          `json:"created_at"`
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request, actorID string) error {
	pg := parsePage(r)
	events, total, err := s.DB.ListAudit(r.Context(), actorID, pg.PerPage, pg.offset())
	if err != nil {
		return err
	}
	out := make([]auditJSON, 0, len(events))
	for _, e := range events {
		meta := json.RawMessage(e.Metadata)
		if !json.Valid(meta) {
			meta = json.RawMessage("{}")
		}
		out = append(out, auditJSON{e.ID, e.Action, e.ActorID, e.ActorEmail, e.TargetType, e.TargetID, meta, ts(e.CreatedAt)})
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) auditLog(w http.ResponseWriter, r *http.Request, p *principal) error {
	return s.listAudit(w, r, p.User.ID)
}

// ---------------------------------------------------------------------------
// Abuse reports (public)

var abuseReasons = map[string]bool{"phishing": true, "malware": true, "spam": true, "illegal": true, "other": true}

// extractSlug accepts a bare slug or a full URL containing /r/<slug>.
func extractSlug(v string) string {
	v = strings.TrimSpace(v)
	if i := strings.Index(v, "/r/"); i >= 0 {
		v = v[i+3:]
		if j := strings.IndexAny(v, "/?#"); j >= 0 {
			v = v[:j]
		}
	}
	return v
}

func (s *Server) createAbuseReport(w http.ResponseWriter, r *http.Request, _ *principal) error {
	if ok, wait := s.abuseLimit.Allow(s.rateKey(r)); !ok {
		return rateLimited(wait)
	}
	var in struct {
		Slug          string  `json:"slug"`
		Reason        string  `json:"reason"`
		Details       string  `json:"details"`
		ReporterEmail *string `json:"reporter_email"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	errs := map[string]string{}
	slug := extractSlug(in.Slug)
	if !slugRegex.MatchString(slug) {
		errs["slug"] = "must be a QR code slug or redirect URL"
	}
	if !abuseReasons[in.Reason] {
		errs["reason"] = "must be one of phishing, malware, spam, illegal, other"
	}
	details := strings.TrimSpace(in.Details)
	if utf8.RuneCountInString(details) > 2000 {
		errs["details"] = "must be at most 2000 characters"
	}
	var email *string
	if in.ReporterEmail != nil && strings.TrimSpace(*in.ReporterEmail) != "" {
		e := storage.NormalizeEmail(*in.ReporterEmail)
		if !validEmail(e) {
			errs["reporter_email"] = "must be a valid email address"
		}
		email = &e
	}
	if len(errs) > 0 {
		return validation(errs)
	}
	report := &storage.AbuseReport{Slug: slug, Reason: in.Reason, Details: details, ReporterEmail: email}
	if q, err := s.DB.GetQRCodeBySlug(r.Context(), slug); err == nil {
		id := q.ID
		report.QRCodeID = &id
	}
	if err := s.DB.CreateAbuseReport(r.Context(), report); err != nil {
		return err
	}
	s.audit(r.Context(), nil, "abuse.report", "abuse_report", report.ID, map[string]any{"slug": slug, "reason": in.Reason})
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "received"})
	return nil
}

// checkDomain answers "may a TLS certificate be issued for this hostname?" for
// reverse proxies with on-demand TLS (for example the "ask" URL of Caddy's
// on_demand_tls). It returns 200 for the primary host and verified custom
// domains, and 404 otherwise.
func (s *Server) checkDomain(w http.ResponseWriter, r *http.Request, _ *principal) error {
	host, err := security.NormalizeHostname(r.URL.Query().Get("domain"))
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return nil
	}
	if host == s.Cfg.BaseHost() {
		w.WriteHeader(http.StatusOK)
		return nil
	}
	d, err := s.DB.GetDomainByHostname(r.Context(), host)
	if err != nil || !d.Verified {
		w.WriteHeader(http.StatusNotFound)
		return nil
	}
	w.WriteHeader(http.StatusOK)
	return nil
}
