package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kspkr/QrForge/server/analytics"
	"github.com/kspkr/QrForge/server/auth"
	"github.com/kspkr/QrForge/server/redirect"
	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

var qrTypes = map[string]bool{
	"url": true, "text": true, "wifi": true, "vcard": true, "email": true,
	"sms": true, "phone": true, "location": true, "calendar": true,
}

var (
	slugRegex     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`)
	reservedSlugs = map[string]bool{
		"api": true, "admin": true, "app": true, "assets": true, "static": true, "report": true,
		"login": true, "logout": true, "register": true, "health": true, "r": true,
	}
	colorRegex = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

const (
	slugAlphabet  = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
	maxDesignSize = 256 << 10
	maxFormSize   = 64 << 10
	maxContentLen = 4096
)

type qrJSON struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Kind             string          `json:"kind"`
	QRType           string          `json:"qr_type"`
	Content          string          `json:"content"`
	Destination      *string         `json:"destination"`
	Slug             *string         `json:"slug"`
	RedirectURL      *string         `json:"redirect_url"`
	Status           string          `json:"status"`
	DisabledReason   *string         `json:"disabled_reason"`
	AdminLocked      bool            `json:"admin_locked"`
	ExpiresAt        *string         `json:"expires_at"`
	HasPassword      bool            `json:"has_password"`
	UTM              *redirect.UTM   `json:"utm"`
	AnalyticsEnabled bool            `json:"analytics_enabled"`
	CampaignID       *string         `json:"campaign_id"`
	DomainID         *string         `json:"domain_id"`
	Design           json.RawMessage `json:"design"`
	FormData         json.RawMessage `json:"form_data"`
	ScanCount        int64           `json:"scan_count"`
	CreatedAt        string          `json:"created_at"`
	UpdatedAt        string          `json:"updated_at"`
	OwnerEmail       string          `json:"owner_email,omitempty"`
}

func (s *Server) redirectURL(q *storage.QRCode) string {
	base := s.Cfg.BaseURLString()
	if q.DomainHost != nil && q.DomainVerified {
		base = s.Cfg.CustomDomainScheme + "://" + *q.DomainHost
	}
	return base + "/r/" + *q.Slug
}

func rawOrNull(p *string) json.RawMessage {
	if p == nil {
		return json.RawMessage("null")
	}
	return json.RawMessage(*p)
}

func (s *Server) toQRJSON(q *storage.QRCode, withOwner bool) qrJSON {
	out := qrJSON{
		ID: q.ID, Name: q.Name, Kind: q.Kind, QRType: q.QRType, Content: q.Content,
		Destination: q.Destination, Slug: q.Slug, Status: q.Status, DisabledReason: q.DisabledReason,
		AdminLocked: q.AdminLocked, ExpiresAt: tsPtr(q.ExpiresAt), HasPassword: q.PasswordHash != nil,
		AnalyticsEnabled: q.AnalyticsEnabled, CampaignID: q.CampaignID, DomainID: q.DomainID,
		Design: rawOrNull(q.Design), FormData: rawOrNull(q.FormData), ScanCount: q.ScanCount,
		CreatedAt: ts(q.CreatedAt), UpdatedAt: ts(q.UpdatedAt),
	}
	if q.Kind == "dynamic" && q.Slug != nil {
		u := s.redirectURL(q)
		out.RedirectURL = &u
		out.Content = u
	}
	if q.UTM != nil {
		var utm redirect.UTM
		if json.Unmarshal([]byte(*q.UTM), &utm) == nil {
			out.UTM = &utm
		}
	}
	if withOwner {
		out.OwnerEmail = q.OwnerEmail
	}
	return out
}

// qrFields applies a set of JSON fields to q (used by create and update).
type qrFields struct {
	s        *Server
	r        *http.Request
	p        *principal
	q        *storage.QRCode
	errs     map[string]string
	creating bool

	destinationChanged bool
	previousDest       *string
}

func (f *qrFields) fail(field, msg string) { f.errs[field] = msg }

func str(raw json.RawMessage) (string, bool) {
	var v string
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", false
	}
	return v, true
}

func (f *qrFields) apply(fields map[string]json.RawMessage) {
	q := f.q
	for key, raw := range fields {
		switch key {
		case "name":
			v, ok := str(raw)
			v = strings.TrimSpace(v)
			if !ok || v == "" || utf8.RuneCountInString(v) > 200 {
				f.fail("name", "must be a non-empty string of at most 200 characters")
				continue
			}
			q.Name = v
		case "destination":
			if q.Kind != "dynamic" {
				if !isNull(raw) {
					f.fail("destination", "is only allowed for dynamic QR codes")
				}
				continue
			}
			v, ok := str(raw)
			if !ok {
				f.fail("destination", "must be a string")
				continue
			}
			norm, err := f.s.Settings.Policy(f.s.Cfg.BaseHost()).ValidateDestination(v)
			if err != nil {
				if de, ok := security.IsDestinationError(err); ok && de.Code == "destination_blocked" {
					f.errs["__blocked"] = de.Message
				}
				f.fail("destination", err.Error())
				continue
			}
			if q.Destination == nil || *q.Destination != norm {
				f.destinationChanged = true
				f.previousDest = q.Destination
				q.Destination = &norm
			}
		case "qr_type":
			v, ok := str(raw)
			if !ok || !qrTypes[v] {
				f.fail("qr_type", "must be one of url, text, wifi, vcard, email, sms, phone, location, calendar")
				continue
			}
			if q.Kind == "dynamic" && v != "url" {
				f.fail("qr_type", "dynamic QR codes always have type url")
				continue
			}
			q.QRType = v
		case "content":
			if q.Kind == "dynamic" {
				continue // derived from the redirect URL
			}
			v, ok := str(raw)
			if !ok || v == "" || utf8.RuneCountInString(v) > maxContentLen {
				f.fail("content", "must be a non-empty string of at most 4096 characters")
				continue
			}
			q.Content = v
		case "slug":
			if q.Kind != "dynamic" {
				if !isNull(raw) {
					f.fail("slug", "is only allowed for dynamic QR codes")
				}
				continue
			}
			if isNull(raw) {
				continue
			}
			v, ok := str(raw)
			if !ok || !slugRegex.MatchString(v) {
				f.fail("slug", "must be 3–64 characters: letters, digits, '-' or '_', starting with a letter or digit")
				continue
			}
			if reservedSlugs[strings.ToLower(v)] {
				f.fail("slug", "is reserved")
				continue
			}
			q.Slug = &v
		case "status":
			v, ok := str(raw)
			if !ok || (v != "active" && v != "disabled") {
				f.fail("status", "must be active or disabled")
				continue
			}
			if v == "active" && q.AdminLocked {
				f.errs["__locked"] = "This QR code was disabled by an administrator and cannot be re-enabled."
				continue
			}
			q.Status = v
		case "expires_at":
			if isNull(raw) {
				q.ExpiresAt = nil
				continue
			}
			v, ok := str(raw)
			t, err := time.Parse(time.RFC3339, v)
			if !ok || err != nil {
				f.fail("expires_at", "must be an RFC 3339 timestamp or null")
				continue
			}
			if f.creating && !t.After(time.Now()) {
				f.fail("expires_at", "must be in the future")
				continue
			}
			u := t.Unix()
			q.ExpiresAt = &u
		case "password":
			if q.Kind != "dynamic" {
				if !isNull(raw) {
					f.fail("password", "is only allowed for dynamic QR codes")
				}
				continue
			}
			if isNull(raw) {
				q.PasswordHash = nil
				continue
			}
			v, ok := str(raw)
			if !ok || len(v) > auth.MaxPasswordLength {
				f.fail("password", "must be a string of at most 72 bytes")
				continue
			}
			if v == "" {
				q.PasswordHash = nil
				continue
			}
			hash, err := f.s.Auth.HashPassword(v)
			if err != nil {
				f.fail("password", "could not be processed")
				continue
			}
			q.PasswordHash = &hash
		case "utm":
			if isNull(raw) {
				q.UTM = nil
				continue
			}
			var utm redirect.UTM
			dec := json.NewDecoder(bytes.NewReader(raw))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&utm); err != nil {
				f.fail("utm", "must be an object with source, medium, campaign, term and content strings")
				continue
			}
			for _, v := range []string{utm.Source, utm.Medium, utm.Campaign, utm.Term, utm.Content} {
				if utf8.RuneCountInString(v) > 200 {
					f.fail("utm", "values must be at most 200 characters")
				}
			}
			if utm == (redirect.UTM{}) {
				q.UTM = nil
				continue
			}
			b, _ := json.Marshal(utm)
			sv := string(b)
			q.UTM = &sv
		case "analytics_enabled":
			var v bool
			if err := json.Unmarshal(raw, &v); err != nil {
				f.fail("analytics_enabled", "must be a boolean")
				continue
			}
			q.AnalyticsEnabled = v
		case "campaign_id":
			if isNull(raw) {
				q.CampaignID = nil
				continue
			}
			v, ok := str(raw)
			if !ok {
				f.fail("campaign_id", "must be a string or null")
				continue
			}
			if _, err := f.s.DB.GetCampaign(f.r.Context(), v, q.UserID); err != nil {
				f.fail("campaign_id", "does not refer to one of your campaigns")
				continue
			}
			q.CampaignID = &v
		case "domain_id":
			if isNull(raw) {
				q.DomainID = nil
				continue
			}
			v, ok := str(raw)
			if !ok {
				f.fail("domain_id", "must be a string or null")
				continue
			}
			if _, err := f.s.DB.GetDomain(f.r.Context(), v, q.UserID); err != nil {
				f.fail("domain_id", "does not refer to one of your domains")
				continue
			}
			q.DomainID = &v
		case "design", "form_data":
			limit := maxDesignSize
			if key == "form_data" {
				limit = maxFormSize
			}
			var target **string = &q.Design
			if key == "form_data" {
				target = &q.FormData
			}
			if isNull(raw) {
				*target = nil
				continue
			}
			trimmed := bytes.TrimSpace(raw)
			if len(trimmed) == 0 || trimmed[0] != '{' {
				f.fail(key, "must be a JSON object or null")
				continue
			}
			if len(trimmed) > limit {
				f.fail(key, "is too large")
				continue
			}
			var compact bytes.Buffer
			if err := json.Compact(&compact, trimmed); err != nil {
				f.fail(key, "must be valid JSON")
				continue
			}
			v := compact.String()
			*target = &v
		}
	}
}

func (s *Server) newSlug(r *http.Request) (string, error) {
	for i := 0; i < 8; i++ {
		slug := storage.RandomString(7, slugAlphabet)
		exists, err := s.DB.SlugExists(r.Context(), slug)
		if err != nil {
			return "", err
		}
		if !exists {
			return slug, nil
		}
	}
	return "", errors.New("could not allocate a unique slug")
}

func (s *Server) checkQuota(r *http.Request, u *storage.User) error {
	if u.IsAdmin() {
		return nil
	}
	limit := s.Settings.Get().MaxQRCodesPerUser
	if u.MaxQRCodes != nil {
		limit = *u.MaxQRCodes
	}
	if limit <= 0 {
		return nil
	}
	n, err := s.DB.CountQRCodes(r.Context(), u.ID)
	if err != nil {
		return err
	}
	if n >= limit {
		return errorf(http.StatusForbidden, "limit_reached", "You have reached the maximum number of QR codes for your account.")
	}
	return nil
}

func fieldsError(errs map[string]string) error {
	if len(errs) == 0 {
		return nil
	}
	if msg, ok := errs["__locked"]; ok {
		return errorf(http.StatusForbidden, "forbidden", msg)
	}
	if msg, ok := errs["__blocked"]; ok {
		delete(errs, "__blocked")
		e := validation(errs)
		e.Code = "destination_blocked"
		e.Message = msg
		return e
	}
	return validation(errs)
}

func (s *Server) createQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	if err := s.checkQuota(r, p.User); err != nil {
		return err
	}
	kind := "dynamic"
	for _, k := range []string{"kind", "type"} {
		if raw, ok := fields[k]; ok {
			v, _ := str(raw)
			if v == "static" || v == "dynamic" {
				kind = v
			} else if k == "kind" {
				return fieldError("kind", "must be static or dynamic")
			}
		}
	}
	delete(fields, "kind")
	delete(fields, "type")

	q := &storage.QRCode{UserID: p.User.ID, Kind: kind, QRType: "url", AnalyticsEnabled: true, Status: "active"}
	f := &qrFields{s: s, r: r, p: p, q: q, errs: map[string]string{}, creating: true}
	if kind == "static" {
		delete(fields, "status")
	}
	f.apply(fields)
	if kind == "dynamic" && q.Destination == nil && f.errs["destination"] == "" {
		f.fail("destination", "is required for dynamic QR codes")
	}
	if kind == "static" && q.Content == "" && f.errs["content"] == "" {
		f.fail("content", "is required for static QR codes")
	}
	if q.Name == "" && f.errs["name"] == "" {
		q.Name = defaultName(q)
	}
	if err := fieldsError(f.errs); err != nil {
		return err
	}
	if kind == "dynamic" {
		if q.Slug == nil {
			slug, err := s.newSlug(r)
			if err != nil {
				return err
			}
			q.Slug = &slug
		}
		q.Content = s.Cfg.BaseURLString() + "/r/" + *q.Slug
	}
	if err := s.DB.CreateQRCode(r.Context(), q); err != nil {
		if errors.Is(err, storage.ErrConflict) {
			return errorf(http.StatusConflict, "conflict", "This slug is already taken.")
		}
		return err
	}
	if kind == "dynamic" {
		if err := s.DB.AddHistory(r.Context(), q.ID, *q.Destination, nil, p.User.ID); err != nil {
			return err
		}
	}
	s.audit(r.Context(), p, "qrcode.create", "qrcode", q.ID, map[string]any{"kind": kind})
	created, err := s.DB.GetQRCode(r.Context(), q.ID, p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, s.toQRJSON(created, false))
	return nil
}

func defaultName(q *storage.QRCode) string {
	if q.Destination != nil {
		if u := analytics.ReferrerHost(*q.Destination); u != "" {
			return u
		}
	}
	return "Untitled " + q.QRType + " QR code"
}

func (s *Server) listQRCodes(w http.ResponseWriter, r *http.Request, p *principal) error {
	pg := parsePage(r)
	qs := r.URL.Query()
	f := storage.QRFilter{
		UserID: p.User.ID, Kind: qs.Get("kind"), Status: qs.Get("status"), CampaignID: qs.Get("campaign_id"),
		Query: qs.Get("q"), Sort: qs.Get("sort"), Limit: pg.PerPage, Offset: pg.offset(),
	}
	if f.Kind != "" && f.Kind != "static" && f.Kind != "dynamic" {
		return fieldError("kind", "must be static or dynamic")
	}
	if f.Status != "" && f.Status != "active" && f.Status != "disabled" {
		return fieldError("status", "must be active or disabled")
	}
	if f.Sort != "" && !storage.ValidQRSort(f.Sort) {
		return fieldError("sort", "must be one of created_at, -created_at, name, -name, scan_count, -scan_count")
	}
	items, total, err := s.DB.ListQRCodes(r.Context(), f)
	if err != nil {
		return err
	}
	out := make([]qrJSON, 0, len(items))
	for _, q := range items {
		out = append(out, s.toQRJSON(q, false))
	}
	writeJSON(w, http.StatusOK, paginated(out, pg, total))
	return nil
}

func (s *Server) ownQR(r *http.Request, p *principal) (*storage.QRCode, error) {
	return s.DB.GetQRCode(r.Context(), r.PathValue("id"), p.User.ID)
}

func (s *Server) getQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.toQRJSON(q, false))
	return nil
}

func (s *Server) updateQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	fields, err := decodeObject(r)
	if err != nil {
		return err
	}
	oldSlug := q.Slug
	f := &qrFields{s: s, r: r, p: p, q: q, errs: map[string]string{}}
	f.apply(fields)
	if err := fieldsError(f.errs); err != nil {
		return err
	}
	if q.Kind == "dynamic" && q.Slug != nil {
		q.Content = s.Cfg.BaseURLString() + "/r/" + *q.Slug
	}
	if err := s.DB.UpdateQRCode(r.Context(), q); err != nil {
		if errors.Is(err, storage.ErrConflict) {
			return errorf(http.StatusConflict, "conflict", "This slug is already taken.")
		}
		return err
	}
	if f.destinationChanged {
		if err := s.DB.AddHistory(r.Context(), q.ID, *q.Destination, f.previousDest, p.User.ID); err != nil {
			return err
		}
	}
	changed := make([]string, 0, len(fields))
	for k := range fields {
		if k != "password" {
			changed = append(changed, k)
		} else {
			changed = append(changed, "password(redacted)")
		}
	}
	meta := map[string]any{"fields": changed}
	if oldSlug != nil && q.Slug != nil && *oldSlug != *q.Slug {
		meta["old_slug"] = *oldSlug
	}
	s.audit(r.Context(), p, "qrcode.update", "qrcode", q.ID, meta)
	updated, err := s.DB.GetQRCode(r.Context(), q.ID, p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.toQRJSON(updated, false))
	return nil
}

func (s *Server) deleteQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	id := r.PathValue("id")
	if err := s.DB.DeleteQRCode(r.Context(), id, p.User.ID); err != nil {
		return err
	}
	s.audit(r.Context(), p, "qrcode.delete", "qrcode", id, nil)
	noContent(w)
	return nil
}

func (s *Server) rotateSlug(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	if q.Kind != "dynamic" {
		return fieldError("kind", "only dynamic QR codes have a slug")
	}
	old := ""
	if q.Slug != nil {
		old = *q.Slug
	}
	slug, err := s.newSlug(r)
	if err != nil {
		return err
	}
	q.Slug = &slug
	q.Content = s.Cfg.BaseURLString() + "/r/" + slug
	if err := s.DB.UpdateQRCode(r.Context(), q); err != nil {
		return err
	}
	s.audit(r.Context(), p, "qrcode.rotate_slug", "qrcode", q.ID, map[string]any{"old_slug": old, "new_slug": slug})
	updated, err := s.DB.GetQRCode(r.Context(), q.ID, p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.toQRJSON(updated, false))
	return nil
}

func (s *Server) duplicateQRCode(w http.ResponseWriter, r *http.Request, p *principal) error {
	src, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	if err := s.checkQuota(r, p.User); err != nil {
		return err
	}
	cp := *src
	cp.ID = ""
	name := src.Name + " (copy)"
	if utf8.RuneCountInString(name) > 200 {
		name = string([]rune(name)[:200])
	}
	cp.Name = name
	if src.AdminLocked {
		cp.Status, cp.AdminLocked, cp.DisabledReason = "disabled", false, nil
	}
	if cp.Kind == "dynamic" {
		slug, err := s.newSlug(r)
		if err != nil {
			return err
		}
		cp.Slug = &slug
		cp.Content = s.Cfg.BaseURLString() + "/r/" + slug
	}
	if err := s.DB.CreateQRCode(r.Context(), &cp); err != nil {
		return err
	}
	if cp.Kind == "dynamic" && cp.Destination != nil {
		if err := s.DB.AddHistory(r.Context(), cp.ID, *cp.Destination, nil, p.User.ID); err != nil {
			return err
		}
	}
	s.audit(r.Context(), p, "qrcode.duplicate", "qrcode", cp.ID, map[string]any{"source_id": src.ID})
	created, err := s.DB.GetQRCode(r.Context(), cp.ID, p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, s.toQRJSON(created, false))
	return nil
}

func (s *Server) qrHistory(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	entries, err := s.DB.ListHistory(r.Context(), q.ID)
	if err != nil {
		return err
	}
	type histJSON struct {
		Destination         string  `json:"destination"`
		PreviousDestination *string `json:"previous_destination"`
		ChangedAt           string  `json:"changed_at"`
		ChangedByEmail      *string `json:"changed_by_email"`
	}
	out := make([]histJSON, 0, len(entries))
	for _, e := range entries {
		out = append(out, histJSON{e.Destination, e.PreviousDestination, ts(e.ChangedAt), e.ChangedByEmail})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
	return nil
}

func rangeParam(r *http.Request) (string, error) {
	key := r.URL.Query().Get("range")
	if key == "" {
		key = "30d"
	}
	if _, ok := analytics.Ranges[key]; !ok {
		return "", fieldError("range", "must be one of 24h, 7d, 30d, 90d, 365d, all")
	}
	return key, nil
}

func (s *Server) qrAnalytics(w http.ResponseWriter, r *http.Request, p *principal) error {
	q, err := s.ownQR(r, p)
	if err != nil {
		return err
	}
	key, err := rangeParam(r)
	if err != nil {
		return err
	}
	rep, err := analytics.Build(r.Context(), s.DB, analytics.ForQRCode(q.ID), key, time.Now())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, rep)
	return nil
}

type namedCountJSON struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Scans int64  `json:"scans"`
}

func toNamedCounts(in []storage.NamedCount) []namedCountJSON {
	out := make([]namedCountJSON, 0, len(in))
	for _, c := range in {
		out = append(out, namedCountJSON{c.ID, c.Name, c.Count})
	}
	return out
}

func (s *Server) analyticsOverview(w http.ResponseWriter, r *http.Request, p *principal) error {
	key, err := rangeParam(r)
	if err != nil {
		return err
	}
	now := time.Now()
	scope := analytics.ForUser(p.User.ID)
	rep, err := analytics.Build(r.Context(), s.DB, scope, key, now)
	if err != nil {
		return err
	}
	from, _, err := analytics.Window(r.Context(), s.DB, scope, key, now)
	if err != nil {
		return err
	}
	top, err := analytics.TopQRCodes(r.Context(), s.DB, p.User.ID, from, 10)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, struct {
		*analytics.Report
		TopQRCodes []namedCountJSON `json:"top_qrcodes"`
	}{rep, toNamedCounts(top)})
	return nil
}
