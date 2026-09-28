package storage

import (
	"context"
	"database/sql"
	"encoding/json"
)

// ---------------------------------------------------------------------------
// Audit log

// AuditEvent is a security-relevant action.
type AuditEvent struct {
	ID         string
	ActorID    *string
	ActorEmail string
	Action     string
	TargetType string
	TargetID   string
	Metadata   string // JSON object
	CreatedAt  int64
}

func (db *DB) InsertAudit(ctx context.Context, e *AuditEvent) error {
	e.ID = NewSortableID("evt")
	e.CreatedAt = Now()
	if e.Metadata == "" {
		e.Metadata = "{}"
	}
	_, err := db.Exec(ctx, `INSERT INTO audit_logs (id, actor_id, actor_email, action, target_type, target_id, metadata, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, e.ID, nullString(e.ActorID), e.ActorEmail, e.Action, e.TargetType, e.TargetID, e.Metadata, e.CreatedAt)
	return err
}

// ListAudit returns events, newest first. actorID empty = all events.
func (db *DB) ListAudit(ctx context.Context, actorID string, limit, offset int) ([]*AuditEvent, int64, error) {
	where := ""
	var args []any
	if actorID != "" {
		where = " WHERE actor_id = ?"
		args = append(args, actorID)
	}
	total, err := db.Count(ctx, "SELECT COUNT(*) FROM audit_logs"+where, args...)
	if err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, "SELECT id, actor_id, actor_email, action, target_type, target_id, metadata, created_at FROM audit_logs"+
		where+" ORDER BY id DESC LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*AuditEvent{}
	for rows.Next() {
		var e AuditEvent
		var actor sql.NullString
		if err := rows.Scan(&e.ID, &actor, &e.ActorEmail, &e.Action, &e.TargetType, &e.TargetID, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, 0, err
		}
		e.ActorID = ptrString(actor)
		out = append(out, &e)
	}
	return out, total, rows.Err()
}

// ---------------------------------------------------------------------------
// Abuse reports

// AbuseReport is a public report about a redirect.
type AbuseReport struct {
	ID            string
	Slug          string
	QRCodeID      *string
	Reason        string
	Details       string
	ReporterEmail *string
	Status        string
	CreatedAt     int64
	ResolvedAt    *int64
}

const abuseColumns = "id, slug, qrcode_id, reason, details, reporter_email, status, created_at, resolved_at"

func scanAbuse(row interface{ Scan(...any) error }) (*AbuseReport, error) {
	var a AbuseReport
	var qr, email sql.NullString
	var resolved sql.NullInt64
	if err := row.Scan(&a.ID, &a.Slug, &qr, &a.Reason, &a.Details, &email, &a.Status, &a.CreatedAt, &resolved); err != nil {
		return nil, mapErr(err)
	}
	a.QRCodeID, a.ReporterEmail, a.ResolvedAt = ptrString(qr), ptrString(email), ptrInt64(resolved)
	return &a, nil
}

func (db *DB) CreateAbuseReport(ctx context.Context, a *AbuseReport) error {
	a.ID = NewSortableID("abr")
	a.CreatedAt = Now()
	a.Status = "open"
	_, err := db.Exec(ctx, "INSERT INTO abuse_reports ("+abuseColumns+") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		a.ID, a.Slug, nullString(a.QRCodeID), a.Reason, a.Details, nullString(a.ReporterEmail), a.Status, a.CreatedAt, nil)
	return err
}

func (db *DB) GetAbuseReport(ctx context.Context, id string) (*AbuseReport, error) {
	return scanAbuse(db.QueryRow(ctx, "SELECT "+abuseColumns+" FROM abuse_reports WHERE id = ?", id))
}

func (db *DB) ListAbuseReports(ctx context.Context, status string, limit, offset int) ([]*AbuseReport, int64, error) {
	where := ""
	var args []any
	if status != "" {
		where = " WHERE status = ?"
		args = append(args, status)
	}
	total, err := db.Count(ctx, "SELECT COUNT(*) FROM abuse_reports"+where, args...)
	if err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, "SELECT "+abuseColumns+" FROM abuse_reports"+where+" ORDER BY id DESC LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*AbuseReport{}
	for rows.Next() {
		a, err := scanAbuse(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

func (db *DB) SetAbuseStatus(ctx context.Context, id, status string) error {
	var resolved any
	if status != "open" {
		resolved = Now()
	}
	_, err := db.Exec(ctx, "UPDATE abuse_reports SET status = ?, resolved_at = ? WHERE id = ?", status, resolved, id)
	return err
}

// ---------------------------------------------------------------------------
// Settings (key/value JSON)

// LoadSettings returns all stored settings as raw JSON values.
func (db *DB) LoadSettings(ctx context.Context) (map[string]json.RawMessage, error) {
	rows, err := db.Query(ctx, "SELECT key, value FROM settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = json.RawMessage(v)
	}
	return out, rows.Err()
}

// SaveSetting upserts a JSON-encoded setting.
func (db *DB) SaveSetting(ctx context.Context, key string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, string(b))
	return err
}

// ---------------------------------------------------------------------------
// Scans and salts

// Scan is one anonymous redirect event. No IP address or full user agent is stored.
type Scan struct {
	QRCodeID     string
	ScannedAt    int64
	VisitorHash  string
	Browser      string
	OS           string
	Device       string
	Country      string
	ReferrerHost string
}

func (db *DB) InsertScan(ctx context.Context, s *Scan) error {
	_, err := db.Exec(ctx, `INSERT INTO scans (id, qrcode_id, scanned_at, visitor_hash, browser, os, device, country, referrer_host)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, NewSortableID("scn"), s.QRCodeID, s.ScannedAt, s.VisitorHash, s.Browser, s.OS, s.Device, s.Country, s.ReferrerHost)
	return err
}

// DeleteScansBefore removes scans older than the cutoff (unix seconds).
func (db *DB) DeleteScansBefore(ctx context.Context, cutoff int64) (int64, error) {
	res, err := db.Exec(ctx, "DELETE FROM scans WHERE scanned_at < ?", cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// GetOrCreateSalt returns the salt for a day, creating it with candidate if absent.
func (db *DB) GetOrCreateSalt(ctx context.Context, day int64, candidate string) (string, error) {
	if _, err := db.Exec(ctx, "INSERT INTO salts (day, salt) VALUES (?, ?) ON CONFLICT (day) DO NOTHING", day, candidate); err != nil {
		return "", err
	}
	var salt string
	err := db.QueryRow(ctx, "SELECT salt FROM salts WHERE day = ?", day).Scan(&salt)
	return salt, err
}

// DeleteSaltsBefore discards old salts so past visitor hashes can never be linked again.
func (db *DB) DeleteSaltsBefore(ctx context.Context, day int64) error {
	_, err := db.Exec(ctx, "DELETE FROM salts WHERE day < ?", day)
	return err
}
