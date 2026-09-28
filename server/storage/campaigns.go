package storage

import (
	"context"
	"database/sql"
	"errors"
)

// Campaign groups QR codes.
type Campaign struct {
	ID          string
	UserID      string
	Name        string
	Description string
	Color       *string
	CreatedAt   int64
	UpdatedAt   int64
	QRCount     int64
	ScanCount   int64
}

const campaignSelect = `SELECT c.id, c.user_id, c.name, c.description, c.color, c.created_at, c.updated_at,
	(SELECT COUNT(*) FROM qrcodes q WHERE q.campaign_id = c.id),
	(SELECT COUNT(*) FROM scans s JOIN qrcodes q ON q.id = s.qrcode_id WHERE q.campaign_id = c.id)
	FROM campaigns c`

func scanCampaign(row interface{ Scan(...any) error }) (*Campaign, error) {
	var c Campaign
	var color sql.NullString
	if err := row.Scan(&c.ID, &c.UserID, &c.Name, &c.Description, &color, &c.CreatedAt, &c.UpdatedAt, &c.QRCount, &c.ScanCount); err != nil {
		return nil, mapErr(err)
	}
	c.Color = ptrString(color)
	return &c, nil
}

func (db *DB) CreateCampaign(ctx context.Context, c *Campaign) error {
	now := Now()
	c.ID = NewID("cmp")
	c.CreatedAt, c.UpdatedAt = now, now
	_, err := db.Exec(ctx, `INSERT INTO campaigns (id, user_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.UserID, c.Name, c.Description, nullString(c.Color), c.CreatedAt, c.UpdatedAt)
	return mapErr(err)
}

func (db *DB) UpdateCampaign(ctx context.Context, c *Campaign) error {
	c.UpdatedAt = Now()
	_, err := db.Exec(ctx, "UPDATE campaigns SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		c.Name, c.Description, nullString(c.Color), c.UpdatedAt, c.ID, c.UserID)
	return mapErr(err)
}

func (db *DB) GetCampaign(ctx context.Context, id, userID string) (*Campaign, error) {
	return scanCampaign(db.QueryRow(ctx, campaignSelect+" WHERE c.id = ? AND c.user_id = ?", id, userID))
}

func (db *DB) ListCampaigns(ctx context.Context, userID string, limit, offset int) ([]*Campaign, int64, error) {
	total, err := db.Count(ctx, "SELECT COUNT(*) FROM campaigns WHERE user_id = ?", userID)
	if err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, campaignSelect+" WHERE c.user_id = ? ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?", userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// DeleteCampaign removes a campaign; its codes are unassigned (ON DELETE SET NULL).
func (db *DB) DeleteCampaign(ctx context.Context, id, userID string) error {
	// Explicit unassign keeps behaviour identical even if FK enforcement is off.
	if _, err := db.Exec(ctx, "UPDATE qrcodes SET campaign_id = NULL WHERE campaign_id = ? AND user_id = ?", id, userID); err != nil {
		return err
	}
	res, err := db.Exec(ctx, "DELETE FROM campaigns WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CampaignQRScans returns per-code scan counts for a campaign since `from` (unix seconds).
func (db *DB) CampaignQRScans(ctx context.Context, campaignID string, from int64) ([]NamedCount, error) {
	rows, err := db.Query(ctx, `SELECT q.id, q.name, (SELECT COUNT(*) FROM scans s WHERE s.qrcode_id = q.id AND s.scanned_at >= ?) AS n
		FROM qrcodes q WHERE q.campaign_id = ? ORDER BY n DESC, q.name`, from, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NamedCount{}
	for rows.Next() {
		var c NamedCount
		if err := rows.Scan(&c.ID, &c.Name, &c.Count); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// NamedCount is an id/name pair with a count.
type NamedCount struct {
	ID    string
	Name  string
	Count int64
}

// ---------------------------------------------------------------------------
// Domains

// Domain is a custom hostname a user can serve redirects from.
type Domain struct {
	ID                string
	UserID            string
	Hostname          string
	VerificationToken string
	Verified          bool
	VerifiedAt        *int64
	CreatedAt         int64
}

const domainColumns = "id, user_id, hostname, verification_token, verified, verified_at, created_at"

func scanDomain(row interface{ Scan(...any) error }) (*Domain, error) {
	var d Domain
	var at sql.NullInt64
	if err := row.Scan(&d.ID, &d.UserID, &d.Hostname, &d.VerificationToken, &d.Verified, &at, &d.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	d.VerifiedAt = ptrInt64(at)
	return &d, nil
}

func (db *DB) CreateDomain(ctx context.Context, d *Domain) error {
	d.ID = NewID("dom")
	d.CreatedAt = Now()
	_, err := db.Exec(ctx, "INSERT INTO domains ("+domainColumns+") VALUES (?, ?, ?, ?, ?, ?, ?)",
		d.ID, d.UserID, d.Hostname, d.VerificationToken, d.Verified, nullInt64(d.VerifiedAt), d.CreatedAt)
	return mapErr(err)
}

func (db *DB) ListDomains(ctx context.Context, userID string) ([]*Domain, error) {
	rows, err := db.Query(ctx, "SELECT "+domainColumns+" FROM domains WHERE user_id = ? ORDER BY created_at DESC, id", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Domain{}
	for rows.Next() {
		d, err := scanDomain(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (db *DB) GetDomain(ctx context.Context, id, userID string) (*Domain, error) {
	return scanDomain(db.QueryRow(ctx, "SELECT "+domainColumns+" FROM domains WHERE id = ? AND user_id = ?", id, userID))
}

func (db *DB) GetDomainByHostname(ctx context.Context, hostname string) (*Domain, error) {
	return scanDomain(db.QueryRow(ctx, "SELECT "+domainColumns+" FROM domains WHERE hostname = ?", hostname))
}

func (db *DB) SetDomainVerified(ctx context.Context, id string) error {
	_, err := db.Exec(ctx, "UPDATE domains SET verified = TRUE, verified_at = ? WHERE id = ?", Now(), id)
	return err
}

func (db *DB) DeleteDomain(ctx context.Context, id, userID string) error {
	if _, err := db.Exec(ctx, "UPDATE qrcodes SET domain_id = NULL WHERE domain_id = ? AND user_id = ?", id, userID); err != nil {
		return err
	}
	res, err := db.Exec(ctx, "DELETE FROM domains WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReleaseStaleDomainClaim deletes an unverified claim on hostname created
// before cutoff, so nobody can squat a domain they don't control. It reports
// whether a claim was released.
func (db *DB) ReleaseStaleDomainClaim(ctx context.Context, hostname string, cutoff int64) (bool, error) {
	d, err := db.GetDomainByHostname(ctx, hostname)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil || d.Verified || d.CreatedAt >= cutoff {
		return false, err
	}
	if _, err := db.Exec(ctx, "UPDATE qrcodes SET domain_id = NULL WHERE domain_id = ?", d.ID); err != nil {
		return false, err
	}
	res, err := db.Exec(ctx, "DELETE FROM domains WHERE id = ? AND verified = FALSE", d.ID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}
