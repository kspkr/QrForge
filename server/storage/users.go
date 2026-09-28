package storage

import (
	"context"
	"database/sql"
	"strings"
)

// User is an account.
type User struct {
	ID           string
	Email        string
	Name         string
	PasswordHash string
	Role         string
	Disabled     bool
	MaxQRCodes   *int64
	CreatedAt    int64
	UpdatedAt    int64
	LastLoginAt  *int64
	QRCount      int64 // populated by admin listings
}

// IsAdmin reports whether the user has the admin role.
func (u *User) IsAdmin() bool { return u.Role == "admin" }

const userColumns = "u.id, u.email, u.name, u.password_hash, u.role, u.disabled, u.max_qrcodes, u.created_at, u.updated_at, u.last_login_at"

func scanUser(row interface{ Scan(...any) error }, extra ...any) (*User, error) {
	var u User
	var maxQR, lastLogin sql.NullInt64
	dest := []any{&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &u.Disabled, &maxQR, &u.CreatedAt, &u.UpdatedAt, &lastLogin}
	dest = append(dest, extra...)
	if err := row.Scan(dest...); err != nil {
		return nil, mapErr(err)
	}
	u.MaxQRCodes = ptrInt64(maxQR)
	u.LastLoginAt = ptrInt64(lastLogin)
	return &u, nil
}

// NormalizeEmail lowercases and trims an email address.
func NormalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// CreateUser inserts a new user. Returns ErrConflict if the email exists.
func (db *DB) CreateUser(ctx context.Context, u *User) error {
	now := Now()
	if u.ID == "" {
		u.ID = NewID("usr")
	}
	u.Email = NormalizeEmail(u.Email)
	u.CreatedAt, u.UpdatedAt = now, now
	if u.Role == "" {
		u.Role = "user"
	}
	_, err := db.Exec(ctx, `INSERT INTO users (id, email, name, password_hash, role, disabled, max_qrcodes, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.Name, u.PasswordHash, u.Role, u.Disabled, nullInt64(u.MaxQRCodes), u.CreatedAt, u.UpdatedAt)
	return mapErr(err)
}

func (db *DB) GetUser(ctx context.Context, id string) (*User, error) {
	return scanUser(db.QueryRow(ctx, "SELECT "+userColumns+" FROM users u WHERE u.id = ?", id))
}

func (db *DB) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(db.QueryRow(ctx, "SELECT "+userColumns+" FROM users u WHERE u.email = ?", NormalizeEmail(email)))
}

// CountUsers returns the number of accounts.
func (db *DB) CountUsers(ctx context.Context) (int64, error) {
	return db.Count(ctx, "SELECT COUNT(*) FROM users")
}

// UpdateUser persists mutable user fields.
func (db *DB) UpdateUser(ctx context.Context, u *User) error {
	u.UpdatedAt = Now()
	u.Email = NormalizeEmail(u.Email)
	_, err := db.Exec(ctx, `UPDATE users SET email = ?, name = ?, password_hash = ?, role = ?, disabled = ?, max_qrcodes = ?, updated_at = ?
		WHERE id = ?`, u.Email, u.Name, u.PasswordHash, u.Role, u.Disabled, nullInt64(u.MaxQRCodes), u.UpdatedAt, u.ID)
	return mapErr(err)
}

func (db *DB) TouchLogin(ctx context.Context, userID string) error {
	_, err := db.Exec(ctx, "UPDATE users SET last_login_at = ? WHERE id = ?", Now(), userID)
	return err
}

// ListUsers lists accounts for administrators, newest first.
func (db *DB) ListUsers(ctx context.Context, q string, limit, offset int) ([]*User, int64, error) {
	where := "1=1"
	var args []any
	if q = strings.TrimSpace(q); q != "" {
		where = "(LOWER(u.email) LIKE ? ESCAPE '\\' OR LOWER(u.name) LIKE ? ESCAPE '\\')"
		p := LikePattern(q)
		args = append(args, p, p)
	}
	total, err := db.Count(ctx, "SELECT COUNT(*) FROM users u WHERE "+where, args...)
	if err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, "SELECT "+userColumns+", (SELECT COUNT(*) FROM qrcodes q WHERE q.user_id = u.id) FROM users u WHERE "+
		where+" ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		var count int64
		u, err := scanUser(rows, &count)
		if err != nil {
			return nil, 0, err
		}
		u.QRCount = count
		out = append(out, u)
	}
	return out, total, rows.Err()
}

// LikePattern builds a case-insensitive substring LIKE pattern with escaping.
func LikePattern(q string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(strings.ToLower(q)) + "%"
}

// ---------------------------------------------------------------------------
// Sessions

// Session is a logged-in browser session. Only the token hash is stored.
type Session struct {
	ID         string
	UserID     string
	TokenHash  string
	CSRFToken  string
	CreatedAt  int64
	LastSeenAt int64
	ExpiresAt  int64
}

func (db *DB) CreateSession(ctx context.Context, s *Session) error {
	if s.ID == "" {
		s.ID = NewID("ses")
	}
	_, err := db.Exec(ctx, `INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, s.ID, s.UserID, s.TokenHash, s.CSRFToken, s.CreatedAt, s.LastSeenAt, s.ExpiresAt)
	return mapErr(err)
}

// GetSessionByHash returns an unexpired session and its user.
func (db *DB) GetSessionByHash(ctx context.Context, tokenHash string) (*Session, *User, error) {
	var s Session
	row := db.QueryRow(ctx, "SELECT s.id, s.user_id, s.token_hash, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at, "+userColumns+
		" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?", tokenHash, Now())
	u, err := scanUserAfter(row, &s.ID, &s.UserID, &s.TokenHash, &s.CSRFToken, &s.CreatedAt, &s.LastSeenAt, &s.ExpiresAt)
	if err != nil {
		return nil, nil, err
	}
	return &s, u, nil
}

// scanUserAfter scans leading columns into prefix then the user columns.
func scanUserAfter(row interface{ Scan(...any) error }, prefix ...any) (*User, error) {
	var u User
	var maxQR, lastLogin sql.NullInt64
	dest := append(prefix, &u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &u.Disabled, &maxQR, &u.CreatedAt, &u.UpdatedAt, &lastLogin)
	if err := row.Scan(dest...); err != nil {
		return nil, mapErr(err)
	}
	u.MaxQRCodes = ptrInt64(maxQR)
	u.LastLoginAt = ptrInt64(lastLogin)
	return &u, nil
}

// ExtendSession updates last-seen and the sliding expiry.
func (db *DB) ExtendSession(ctx context.Context, id string, lastSeen, expires int64) error {
	_, err := db.Exec(ctx, "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", lastSeen, expires, id)
	return err
}

func (db *DB) DeleteSession(ctx context.Context, id string) error {
	_, err := db.Exec(ctx, "DELETE FROM sessions WHERE id = ?", id)
	return err
}

// DeleteUserSessions revokes all sessions for a user except keepID (may be empty).
func (db *DB) DeleteUserSessions(ctx context.Context, userID, keepID string) error {
	_, err := db.Exec(ctx, "DELETE FROM sessions WHERE user_id = ? AND id <> ?", userID, keepID)
	return err
}

// ---------------------------------------------------------------------------
// Password resets

func (db *DB) CreatePasswordReset(ctx context.Context, userID, tokenHash string, expiresAt int64) error {
	_, err := db.Exec(ctx, `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		NewID("rst"), userID, tokenHash, Now(), expiresAt)
	return mapErr(err)
}

// ConsumePasswordReset marks a valid, unused token as used and returns its user id.
func (db *DB) ConsumePasswordReset(ctx context.Context, tokenHash string) (string, error) {
	var id, userID string
	err := db.QueryRow(ctx, "SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
		tokenHash, Now()).Scan(&id, &userID)
	if err != nil {
		return "", mapErr(err)
	}
	res, err := db.Exec(ctx, "UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL", Now(), id)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return "", ErrNotFound
	}
	return userID, nil
}

// ---------------------------------------------------------------------------
// API keys

// APIKey is a long-lived credential. Only its SHA-256 hash is stored.
type APIKey struct {
	ID         string
	UserID     string
	Name       string
	Prefix     string
	KeyHash    string
	LastUsedAt *int64
	UsageCount int64
	CreatedAt  int64
}

func (db *DB) CreateAPIKey(ctx context.Context, k *APIKey) error {
	if k.ID == "" {
		k.ID = NewID("key")
	}
	k.CreatedAt = Now()
	_, err := db.Exec(ctx, `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		k.ID, k.UserID, k.Name, k.Prefix, k.KeyHash, k.CreatedAt)
	return mapErr(err)
}

func scanAPIKey(row interface{ Scan(...any) error }) (*APIKey, error) {
	var k APIKey
	var last sql.NullInt64
	if err := row.Scan(&k.ID, &k.UserID, &k.Name, &k.Prefix, &k.KeyHash, &last, &k.UsageCount, &k.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	k.LastUsedAt = ptrInt64(last)
	return &k, nil
}

const apiKeyColumns = "k.id, k.user_id, k.name, k.prefix, k.key_hash, k.last_used_at, k.usage_count, k.created_at"

func (db *DB) ListAPIKeys(ctx context.Context, userID string) ([]*APIKey, error) {
	rows, err := db.Query(ctx, "SELECT "+apiKeyColumns+" FROM api_keys k WHERE k.user_id = ? ORDER BY k.created_at DESC, k.id", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*APIKey{}
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// GetAPIKeyByHash returns the key and its owner.
func (db *DB) GetAPIKeyByHash(ctx context.Context, keyHash string) (*APIKey, *User, error) {
	var k APIKey
	var last sql.NullInt64
	row := db.QueryRow(ctx, "SELECT "+apiKeyColumns+", "+userColumns+" FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?", keyHash)
	u, err := scanUserAfter(row, &k.ID, &k.UserID, &k.Name, &k.Prefix, &k.KeyHash, &last, &k.UsageCount, &k.CreatedAt)
	if err != nil {
		return nil, nil, err
	}
	k.LastUsedAt = ptrInt64(last)
	return &k, u, nil
}

func (db *DB) TouchAPIKey(ctx context.Context, id string) error {
	_, err := db.Exec(ctx, "UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?", Now(), id)
	return err
}

// DeleteAPIKey removes a key owned by userID.
func (db *DB) DeleteAPIKey(ctx context.Context, userID, id string) error {
	res, err := db.Exec(ctx, "DELETE FROM api_keys WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CleanupExpired removes expired sessions and stale password reset tokens.
func (db *DB) CleanupExpired(ctx context.Context) error {
	now := Now()
	if _, err := db.Exec(ctx, "DELETE FROM sessions WHERE expires_at <= ?", now); err != nil {
		return err
	}
	_, err := db.Exec(ctx, "DELETE FROM password_resets WHERE expires_at <= ?", now-86400)
	return err
}
