package storage

import (
	"context"
	"database/sql"
	"strings"
)

// QRCode is a saved static or dynamic QR code.
type QRCode struct {
	ID               string
	UserID           string
	Name             string
	Kind             string // "static" | "dynamic"
	QRType           string
	Content          string
	Destination      *string
	Slug             *string
	Status           string // "active" | "disabled"
	DisabledReason   *string
	AdminLocked      bool
	ExpiresAt        *int64
	PasswordHash     *string
	UTM              *string // JSON object
	AnalyticsEnabled bool
	CampaignID       *string
	DomainID         *string
	Design           *string // JSON
	FormData         *string // JSON
	CreatedAt        int64
	UpdatedAt        int64

	// Derived / joined fields.
	ScanCount      int64
	OwnerEmail     string
	OwnerDisabled  bool
	DomainHost     *string
	DomainVerified bool
}

const qrSelect = `SELECT q.id, q.user_id, q.name, q.kind, q.qr_type, q.content, q.destination, q.slug, q.status,
	q.disabled_reason, q.admin_locked, q.expires_at, q.password_hash, q.utm, q.analytics_enabled, q.campaign_id,
	q.domain_id, q.design, q.form_data, q.created_at, q.updated_at,
	(SELECT COUNT(*) FROM scans s WHERE s.qrcode_id = q.id) AS scan_count,
	u.email, u.disabled, d.hostname, d.verified
	FROM qrcodes q JOIN users u ON u.id = q.user_id LEFT JOIN domains d ON d.id = q.domain_id`

func scanQRCode(row interface{ Scan(...any) error }) (*QRCode, error) {
	var q QRCode
	var dest, slug, reason, pw, utm, campaign, domain, design, form, host sql.NullString
	var expires sql.NullInt64
	var verified sql.NullBool
	err := row.Scan(&q.ID, &q.UserID, &q.Name, &q.Kind, &q.QRType, &q.Content, &dest, &slug, &q.Status,
		&reason, &q.AdminLocked, &expires, &pw, &utm, &q.AnalyticsEnabled, &campaign,
		&domain, &design, &form, &q.CreatedAt, &q.UpdatedAt, &q.ScanCount,
		&q.OwnerEmail, &q.OwnerDisabled, &host, &verified)
	if err != nil {
		return nil, mapErr(err)
	}
	q.Destination, q.Slug, q.DisabledReason = ptrString(dest), ptrString(slug), ptrString(reason)
	q.PasswordHash, q.UTM, q.CampaignID = ptrString(pw), ptrString(utm), ptrString(campaign)
	q.DomainID, q.Design, q.FormData = ptrString(domain), ptrString(design), ptrString(form)
	q.ExpiresAt = ptrInt64(expires)
	q.DomainHost = ptrString(host)
	q.DomainVerified = verified.Valid && verified.Bool
	return &q, nil
}

// CreateQRCode inserts a QR code. Returns ErrConflict when the slug is taken.
func (db *DB) CreateQRCode(ctx context.Context, q *QRCode) error {
	now := Now()
	if q.ID == "" {
		q.ID = NewID("qr")
	}
	q.CreatedAt, q.UpdatedAt = now, now
	if q.Status == "" {
		q.Status = "active"
	}
	_, err := db.Exec(ctx, `INSERT INTO qrcodes (id, user_id, name, kind, qr_type, content, destination, slug, status,
		disabled_reason, admin_locked, expires_at, password_hash, utm, analytics_enabled, campaign_id, domain_id,
		design, form_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		q.ID, q.UserID, q.Name, q.Kind, q.QRType, q.Content, nullString(q.Destination), nullString(q.Slug), q.Status,
		nullString(q.DisabledReason), q.AdminLocked, nullInt64(q.ExpiresAt), nullString(q.PasswordHash), nullString(q.UTM),
		q.AnalyticsEnabled, nullString(q.CampaignID), nullString(q.DomainID), nullString(q.Design), nullString(q.FormData),
		q.CreatedAt, q.UpdatedAt)
	return mapErr(err)
}

// UpdateQRCode persists every mutable column of q.
func (db *DB) UpdateQRCode(ctx context.Context, q *QRCode) error {
	q.UpdatedAt = Now()
	_, err := db.Exec(ctx, `UPDATE qrcodes SET name = ?, qr_type = ?, content = ?, destination = ?, slug = ?, status = ?,
		disabled_reason = ?, admin_locked = ?, expires_at = ?, password_hash = ?, utm = ?, analytics_enabled = ?,
		campaign_id = ?, domain_id = ?, design = ?, form_data = ?, updated_at = ? WHERE id = ?`,
		q.Name, q.QRType, q.Content, nullString(q.Destination), nullString(q.Slug), q.Status,
		nullString(q.DisabledReason), q.AdminLocked, nullInt64(q.ExpiresAt), nullString(q.PasswordHash), nullString(q.UTM),
		q.AnalyticsEnabled, nullString(q.CampaignID), nullString(q.DomainID), nullString(q.Design), nullString(q.FormData),
		q.UpdatedAt, q.ID)
	return mapErr(err)
}

// GetQRCode fetches a code by id. If userID is non-empty the code must belong to that user.
func (db *DB) GetQRCode(ctx context.Context, id, userID string) (*QRCode, error) {
	if userID == "" {
		return scanQRCode(db.QueryRow(ctx, qrSelect+" WHERE q.id = ?", id))
	}
	return scanQRCode(db.QueryRow(ctx, qrSelect+" WHERE q.id = ? AND q.user_id = ?", id, userID))
}

// GetQRCodeBySlug fetches a dynamic code by its slug.
func (db *DB) GetQRCodeBySlug(ctx context.Context, slug string) (*QRCode, error) {
	return scanQRCode(db.QueryRow(ctx, qrSelect+" WHERE q.slug = ?", slug))
}

// SlugExists reports whether a slug is in use.
func (db *DB) SlugExists(ctx context.Context, slug string) (bool, error) {
	n, err := db.Count(ctx, "SELECT COUNT(*) FROM qrcodes WHERE slug = ?", slug)
	return n > 0, err
}

func (db *DB) DeleteQRCode(ctx context.Context, id, userID string) error {
	res, err := db.Exec(ctx, "DELETE FROM qrcodes WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CountQRCodes returns how many codes a user owns.
func (db *DB) CountQRCodes(ctx context.Context, userID string) (int64, error) {
	return db.Count(ctx, "SELECT COUNT(*) FROM qrcodes WHERE user_id = ?", userID)
}

// QRFilter describes a QR code listing.
type QRFilter struct {
	UserID     string // empty = all users (admin)
	Kind       string
	Status     string
	CampaignID string
	Query      string
	Sort       string
	Limit      int
	Offset     int
}

var qrSorts = map[string]string{
	"created_at":  "q.created_at ASC, q.id",
	"-created_at": "q.created_at DESC, q.id",
	"name":        "LOWER(q.name) ASC, q.id",
	"-name":       "LOWER(q.name) DESC, q.id",
	"scan_count":  "scan_count ASC, q.id",
	"-scan_count": "scan_count DESC, q.id",
}

// ValidQRSort reports whether s is an accepted sort key.
func ValidQRSort(s string) bool { _, ok := qrSorts[s]; return ok }

// ListQRCodes returns a page of codes matching f and the total count.
func (db *DB) ListQRCodes(ctx context.Context, f QRFilter) ([]*QRCode, int64, error) {
	var conds []string
	var args []any
	if f.UserID != "" {
		conds = append(conds, "q.user_id = ?")
		args = append(args, f.UserID)
	}
	if f.Kind != "" {
		conds = append(conds, "q.kind = ?")
		args = append(args, f.Kind)
	}
	if f.Status != "" {
		conds = append(conds, "q.status = ?")
		args = append(args, f.Status)
	}
	if f.CampaignID != "" {
		conds = append(conds, "q.campaign_id = ?")
		args = append(args, f.CampaignID)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		p := LikePattern(q)
		conds = append(conds, `(LOWER(q.name) LIKE ? ESCAPE '\' OR LOWER(COALESCE(q.destination, '')) LIKE ? ESCAPE '\'
			OR LOWER(COALESCE(q.slug, '')) LIKE ? ESCAPE '\' OR LOWER(q.content) LIKE ? ESCAPE '\' OR LOWER(u.email) LIKE ? ESCAPE '\')`)
		args = append(args, p, p, p, p, p)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}
	total, err := db.Count(ctx, "SELECT COUNT(*) FROM qrcodes q JOIN users u ON u.id = q.user_id"+where, args...)
	if err != nil {
		return nil, 0, err
	}
	order, ok := qrSorts[f.Sort]
	if !ok {
		order = qrSorts["-created_at"]
	}
	rows, err := db.Query(ctx, qrSelect+where+" ORDER BY "+order+" LIMIT ? OFFSET ?", append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*QRCode{}
	for rows.Next() {
		q, err := scanQRCode(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, q)
	}
	return out, total, rows.Err()
}

// ---------------------------------------------------------------------------
// Destination history

// HistoryEntry records a destination change of a dynamic code.
type HistoryEntry struct {
	ID                  string
	QRCodeID            string
	Destination         string
	PreviousDestination *string
	ChangedBy           *string
	ChangedByEmail      *string
	ChangedAt           int64
}

func (db *DB) AddHistory(ctx context.Context, qrID, destination string, previous *string, changedBy string) error {
	var by any
	if changedBy != "" {
		by = changedBy
	}
	_, err := db.Exec(ctx, `INSERT INTO qrcode_history (id, qrcode_id, destination, previous_destination, changed_by, changed_at)
		VALUES (?, ?, ?, ?, ?, ?)`, NewSortableID("hist"), qrID, destination, nullString(previous), by, Now())
	return err
}

func (db *DB) ListHistory(ctx context.Context, qrID string) ([]*HistoryEntry, error) {
	rows, err := db.Query(ctx, `SELECT h.id, h.qrcode_id, h.destination, h.previous_destination, h.changed_by, u.email, h.changed_at
		FROM qrcode_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.qrcode_id = ?
		ORDER BY h.changed_at DESC, h.id DESC`, qrID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*HistoryEntry{}
	for rows.Next() {
		var h HistoryEntry
		var prev, by, email sql.NullString
		if err := rows.Scan(&h.ID, &h.QRCodeID, &h.Destination, &prev, &by, &email, &h.ChangedAt); err != nil {
			return nil, err
		}
		h.PreviousDestination, h.ChangedBy, h.ChangedByEmail = ptrString(prev), ptrString(by), ptrString(email)
		out = append(out, &h)
	}
	return out, rows.Err()
}
