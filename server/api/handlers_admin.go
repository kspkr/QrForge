package api

import (
	"encoding/json"
	"net/http"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kspkr/QrForge/server/analytics"
	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request, _ *principal) error {
	ctx := r.Context()
	now := time.Now()
	counts := map[string]int64{}
	queries := []struct {
		key string
		sql string
		arg []any
	}{
		{"users", "SELECT COUNT(*) FROM users", nil},
		{"qrcodes", "SELECT COUNT(*) FROM qrcodes", nil},
		{"dynamic_qrcodes", "SELECT COUNT(*) FROM qrcodes WHERE kind = 'dynamic'", nil},
		{"active_redirects", "SELECT COUNT(*) FROM qrcodes q JOIN users u ON u.id = q.user_id WHERE q.kind = 'dynamic' AND q.status = 'active' AND u.disabled = FALSE AND (q.expires_at IS NULL OR q.expires_at > ?)", []any{now.Unix()}},
		{"scans_total", "SELECT COUNT(*) FROM scans", nil},
		{"scans_24h", "SELECT COUNT(*) FROM scans WHERE scanned_at >= ?", []any{now.Unix() - 86400}},
		{"open_abuse_reports", "SELECT COUNT(*) FROM abuse_reports WHERE status = 'open'", nil},
		{"api_keys", "SELECT COUNT(*) FROM api_keys", nil},
		{"api_requests_total", "SELECT COALESCE(SUM(usage_count), 0) FROM api_keys", nil},
	}
	for _, q := range queries {
		var v any
		if err := s.DB.QueryRow(ctx, q.sql, q.arg...).Scan(&v); err != nil {
			return err
		}
		counts[q.key] = anyToInt64(v)
	}

	dbStatus := "ok"
	if err := s.DB.PingContext(ctx); err != nil {
		dbStatus = "error"
	}
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	today := now.Unix() / 86400 * 86400
	series, err := analytics.Timeseries(ctx, s.DB, analytics.All(), today-29*86400, 86400, now)
	if err != nil {
		return err
	}
	traffic := make([]map[string]any, 0, len(series))
	for _, p := range series {
		traffic = append(traffic, map[string]any{"bucket": p.Bucket, "scans": p.Scans})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"counts":  counts,
		"storage": map[string]any{"driver": string(s.DB.Dialect), "database_bytes": s.DB.SizeBytes(ctx)},
		"system": map[string]any{
			"version":        config.Version,
			"go_version":     runtime.Version(),
			"uptime_seconds": int64(time.Since(s.started).Seconds()),
			"goroutines":     runtime.NumGoroutine(),
			"memory_bytes":   mem.Alloc,
			"database":       dbStatus,
		},
		"traffic": traffic,
	})
	return nil
}

// anyToInt64 normalises driver-specific numeric types (SUM may return numeric on Postgres).
func anyToInt64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int32:
		return int64(x)
	case float64:
		return int64(x)
	case []byte:
		return parseIntLoose(string(x))
	case string:
		return parseIntLoose(x)
	}
	return 0
}

func parseIntLoose(s string) int64 {
	var n int64
	for _, c := range s {
		if c == '.' {
			break
		}
		if c >= '0' && c <= '9' {
			n = n*10 + int64(c-'0')
		}
	}
	return n
}

type adminUserJSON struct {
	userJSON
	Disabled    bool    `json:"disabled"`
	QRCount     int64   `json:"qr_count"`
	LastLoginAt *string `json:"last_login_at"`
	MaxQRCodes  *int64  `json:"max_qrcodes"`
}

func toAdminUser(u *storage.User) adminUserJSON {
	return adminUserJSON{toUserJSON(u), u.Disabled, u.QRCount, tsPtr(u.LastLoginAt), u.MaxQRCodes}
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request, _ *principal) error {
	pg := parsePage(r)
	users, total, err := s.DB.ListUsers(r.Context(), r.URL.Query().Get("q"), pg.PerPage, pg.offset())
	if err != nil {
		return err
	}
	out := make([]adminUserJSON, 0, len(users))
	for _, u := range users {
		out = append(out, toAdminUser(u))
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) adminUpdateUser(w http.ResponseWriter, r *http.Request, p *principal) error {
	u, err := s.DB.GetUser(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	self := u.ID == p.User.ID
	errs := map[string]string{}
	revoke := false
	for key, raw := range fields {
		switch key {
		case "role":
			v, ok := str(raw)
			if !ok || (v != "user" && v != "admin") {
				errs["role"] = "must be user or admin"
			} else if self && v != "admin" {
				errs["role"] = "you cannot remove your own admin role"
			} else {
				u.Role = v
			}
		case "disabled":
			var v bool
			if err := json.Unmarshal(raw, &v); err != nil {
				errs["disabled"] = "must be a boolean"
			} else if self && v {
				errs["disabled"] = "you cannot disable your own account"
			} else {
				revoke = v && !u.Disabled
				u.Disabled = v
			}
		case "max_qrcodes":
			if isNull(raw) {
				u.MaxQRCodes = nil
				continue
			}
			var v int64
			if err := json.Unmarshal(raw, &v); err != nil || v < 0 {
				errs["max_qrcodes"] = "must be a non-negative integer or null"
			} else {
				u.MaxQRCodes = &v
			}
		}
	}
	if len(errs) > 0 {
		return validation(errs)
	}
	if err := s.DB.UpdateUser(r.Context(), u); err != nil {
		return err
	}
	if revoke {
		if err := s.DB.DeleteUserSessions(r.Context(), u.ID, ""); err != nil {
			return err
		}
	}
	s.audit(r.Context(), p, "admin.user_update", "user", u.ID, map[string]any{"role": u.Role, "disabled": u.Disabled})
	u.QRCount, _ = s.DB.CountQRCodes(r.Context(), u.ID)
	writeJSON(w, http.StatusOK, toAdminUser(u))
	return nil
}

func (s *Server) adminListQRCodes(w http.ResponseWriter, r *http.Request, _ *principal) error {
	pg := parsePage(r)
	qs := r.URL.Query()
	f := storage.QRFilter{Status: qs.Get("status"), Kind: qs.Get("kind"), Query: qs.Get("q"), Sort: qs.Get("sort"), Limit: pg.PerPage, Offset: pg.offset()}
	if f.Status != "" && f.Status != "active" && f.Status != "disabled" {
		return fieldError("status", "must be active or disabled")
	}
	items, total, err := s.DB.ListQRCodes(r.Context(), f)
	if err != nil {
		return err
	}
	out := make([]qrJSON, 0, len(items))
	for _, q := range items {
		out = append(out, s.toQRJSON(q, true))
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) adminSetQRStatus(r *http.Request, p *principal, q *storage.QRCode, status, reason string) error {
	if status == "disabled" {
		if reason == "" {
			reason = "Disabled by an administrator."
		}
		q.Status, q.AdminLocked, q.DisabledReason = "disabled", true, &reason
	} else {
		q.Status, q.AdminLocked, q.DisabledReason = "active", false, nil
	}
	if err := s.DB.UpdateQRCode(r.Context(), q); err != nil {
		return err
	}
	s.audit(r.Context(), p, "admin.qrcode_update", "qrcode", q.ID, map[string]any{"status": status, "reason": reason})
	return nil
}

func (s *Server) adminUpdateQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.DB.GetQRCode(r.Context(), r.PathValue("id"), "")
	if err != nil {
		return err
	}
	var in struct {
		Status         string `json:"status"`
		DisabledReason string `json:"disabled_reason"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	if in.Status != "active" && in.Status != "disabled" {
		return fieldError("status", "must be active or disabled")
	}
	reason := strings.TrimSpace(in.DisabledReason)
	if utf8.RuneCountInString(reason) > 500 {
		return fieldError("disabled_reason", "must be at most 500 characters")
	}
	if err := s.adminSetQRStatus(r, p, q, in.Status, reason); err != nil {
		return err
	}
	updated, err := s.DB.GetQRCode(r.Context(), q.ID, "")
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.toQRJSON(updated, true))
	return nil
}

type abuseJSON struct {
	ID            string  `json:"id"`
	Slug          string  `json:"slug"`
	QRCodeID      *string `json:"qrcode_id"`
	Reason        string  `json:"reason"`
	Details       string  `json:"details"`
	ReporterEmail *string `json:"reporter_email"`
	Status        string  `json:"status"`
	CreatedAt     string  `json:"created_at"`
	ResolvedAt    *string `json:"resolved_at"`
}

func toAbuseJSON(a *storage.AbuseReport) abuseJSON {
	return abuseJSON{a.ID, a.Slug, a.QRCodeID, a.Reason, a.Details, a.ReporterEmail, a.Status, ts(a.CreatedAt), tsPtr(a.ResolvedAt)}
}

var abuseStatuses = map[string]bool{"open": true, "resolved": true, "dismissed": true}

func (s *Server) adminListAbuse(w http.ResponseWriter, r *http.Request, _ *principal) error {
	pg := parsePage(r)
	status := r.URL.Query().Get("status")
	if status != "" && !abuseStatuses[status] {
		return fieldError("status", "must be open, resolved or dismissed")
	}
	items, total, err := s.DB.ListAbuseReports(r.Context(), status, pg.PerPage, pg.offset())
	if err != nil {
		return err
	}
	out := make([]abuseJSON, 0, len(items))
	for _, a := range items {
		out = append(out, toAbuseJSON(a))
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) adminUpdateAbuse(w http.ResponseWriter, r *http.Request, p *principal) error {
	a, err := s.DB.GetAbuseReport(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	var in struct {
		Status        string `json:"status"`
		DisableQRCode bool   `json:"disable_qrcode"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	if !abuseStatuses[in.Status] {
		return fieldError("status", "must be open, resolved or dismissed")
	}
	if in.DisableQRCode && a.QRCodeID != nil {
		q, err := s.DB.GetQRCode(r.Context(), *a.QRCodeID, "")
		if err == nil {
			if err := s.adminSetQRStatus(r, p, q, "disabled", "Disabled after an abuse report ("+a.Reason+")."); err != nil {
				return err
			}
		}
	}
	if err := s.DB.SetAbuseStatus(r.Context(), a.ID, in.Status); err != nil {
		return err
	}
	s.audit(r.Context(), p, "admin.abuse_update", "abuse_report", a.ID, map[string]any{"status": in.Status, "disable_qrcode": in.DisableQRCode})
	a, err = s.DB.GetAbuseReport(r.Context(), a.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, toAbuseJSON(a))
	return nil
}

func (s *Server) adminGetSettings(w http.ResponseWriter, r *http.Request, _ *principal) error {
	writeJSON(w, http.StatusOK, s.Settings.Get())
	return nil
}

func normalizeHostList(field string, list []string, errs map[string]string) []string {
	out := []string{}
	seen := map[string]bool{}
	if len(list) > 1000 {
		errs[field] = "must contain at most 1000 entries"
		return out
	}
	for _, entry := range list {
		e := strings.TrimPrefix(strings.TrimSpace(strings.ToLower(entry)), "*.")
		if e == "" {
			continue
		}
		h, err := security.NormalizeHostname(e)
		if err != nil {
			errs[field] = "contains an invalid domain: " + entry
			return out
		}
		if !seen[h] {
			seen[h] = true
			out = append(out, h)
		}
	}
	return out
}

func (s *Server) adminUpdateSettings(w http.ResponseWriter, r *http.Request, p *principal) error {
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	next := s.Settings.Get()
	errs := map[string]string{}
	for key, raw := range fields {
		switch key {
		case "registration_enabled":
			if json.Unmarshal(raw, &next.RegistrationEnabled) != nil {
				errs[key] = "must be a boolean"
			}
		case "block_private_destinations":
			if json.Unmarshal(raw, &next.BlockPrivateDestinations) != nil {
				errs[key] = "must be a boolean"
			}
		case "max_qrcodes_per_user":
			if json.Unmarshal(raw, &next.MaxQRCodesPerUser) != nil || next.MaxQRCodesPerUser < 0 {
				errs[key] = "must be a non-negative integer (0 = unlimited)"
			}
		case "max_redirect_length":
			if json.Unmarshal(raw, &next.MaxRedirectLength) != nil || next.MaxRedirectLength < 64 || next.MaxRedirectLength > 8192 {
				errs[key] = "must be an integer between 64 and 8192"
			}
		case "analytics_retention_days":
			if json.Unmarshal(raw, &next.AnalyticsRetentionDays) != nil || next.AnalyticsRetentionDays < 0 || next.AnalyticsRetentionDays > 3650 {
				errs[key] = "must be an integer between 0 (keep forever) and 3650"
			}
		case "domain_allowlist", "domain_blocklist":
			var list []string
			if json.Unmarshal(raw, &list) != nil {
				errs[key] = "must be an array of domain names"
				continue
			}
			norm := normalizeHostList(key, list, errs)
			if key == "domain_allowlist" {
				next.DomainAllowlist = norm
			} else {
				next.DomainBlocklist = norm
			}
		}
	}
	if len(errs) > 0 {
		return validation(errs)
	}
	if err := s.Settings.Save(r.Context(), next); err != nil {
		return err
	}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	s.audit(r.Context(), p, "admin.settings_update", "settings", "", map[string]any{"fields": keys})
	writeJSON(w, http.StatusOK, s.Settings.Get())
	return nil
}

func (s *Server) adminAuditLog(w http.ResponseWriter, r *http.Request, _ *principal) error {
	return s.listAudit(w, r, "")
}
