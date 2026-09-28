// Package auth implements accounts, sessions, API keys and password resets
// without any external identity provider.
package auth

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

const (
	// SessionCookie is the name of the session cookie.
	SessionCookie = "qrforge_session"
	// APIKeyPrefix prefixes every API key so they are easy to recognise (and to scan for in leaks).
	APIKeyPrefix = "qrf_"

	MinPasswordLength = 8
	// MaxPasswordLength is in bytes. bcrypt only uses the first 72 bytes and
	// golang.org/x/crypto/bcrypt rejects longer input, so it is enforced here.
	MaxPasswordLength = 72
	resetTTL          = time.Hour
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrDisabled           = errors.New("account disabled")
)

// Service bundles authentication operations.
type Service struct {
	DB         *storage.DB
	BcryptCost int
	SessionTTL time.Duration

	// dummyHash is compared against when an email is unknown, so login
	// timing does not reveal which emails have accounts.
	dummyHash []byte
}

// NewService creates an auth service.
func NewService(db *storage.DB, cost int, ttl time.Duration) *Service {
	if cost < bcrypt.MinCost {
		cost = bcrypt.DefaultCost
	}
	dummy, _ := bcrypt.GenerateFromPassword([]byte("qrforge-timing-equalizer"), cost)
	return &Service{DB: db, BcryptCost: cost, SessionTTL: ttl, dummyHash: dummy}
}

// ValidatePassword enforces length rules. Returns a user-facing message or "".
func ValidatePassword(pw string) string {
	n := utf8.RuneCountInString(pw)
	if n < MinPasswordLength {
		return "must be at least 8 characters"
	}
	if len(pw) > MaxPasswordLength {
		return "must be at most 72 bytes"
	}
	return ""
}

// HashPassword hashes a password with bcrypt.
func (s *Service) HashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), s.BcryptCost)
	return string(h), err
}

// CheckPassword compares a password against a bcrypt hash.
func CheckPassword(hash, pw string) bool {
	if len(pw) > MaxPasswordLength {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// Authenticate verifies email + password.
func (s *Service) Authenticate(ctx context.Context, email, password string) (*storage.User, error) {
	u, err := s.DB.GetUserByEmail(ctx, email)
	if errors.Is(err, storage.ErrNotFound) {
		_ = bcrypt.CompareHashAndPassword(s.dummyHash, []byte(password))
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if !CheckPassword(u.PasswordHash, password) {
		return nil, ErrInvalidCredentials
	}
	if u.Disabled {
		return nil, ErrDisabled
	}
	return u, nil
}

// NewSession creates a session and returns it with the plaintext token for the cookie.
func (s *Service) NewSession(ctx context.Context, userID string) (*storage.Session, string, error) {
	token := security.RandomToken(32)
	now := time.Now().Unix()
	sess := &storage.Session{
		UserID:     userID,
		TokenHash:  security.HashToken(token),
		CSRFToken:  security.RandomToken(24),
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now + int64(s.SessionTTL.Seconds()),
	}
	if err := s.DB.CreateSession(ctx, sess); err != nil {
		return nil, "", err
	}
	return sess, token, nil
}

// ResolveSession looks up a session token; it extends the sliding expiry at most hourly.
func (s *Service) ResolveSession(ctx context.Context, token string) (*storage.Session, *storage.User, error) {
	if token == "" || len(token) > 128 {
		return nil, nil, storage.ErrNotFound
	}
	sess, u, err := s.DB.GetSessionByHash(ctx, security.HashToken(token))
	if err != nil {
		return nil, nil, err
	}
	if u.Disabled {
		return nil, nil, ErrDisabled
	}
	now := time.Now().Unix()
	if now-sess.LastSeenAt > 3600 {
		sess.LastSeenAt = now
		sess.ExpiresAt = now + int64(s.SessionTTL.Seconds())
		_ = s.DB.ExtendSession(ctx, sess.ID, sess.LastSeenAt, sess.ExpiresAt)
	}
	return sess, u, nil
}

// NewAPIKey creates a key and returns the stored record plus the plaintext
// key, which is shown to the user exactly once.
func (s *Service) NewAPIKey(ctx context.Context, userID, name string) (*storage.APIKey, string, error) {
	secret := storage.RandomString(32, "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
	plain := APIKeyPrefix + secret
	k := &storage.APIKey{
		UserID:  userID,
		Name:    name,
		Prefix:  APIKeyPrefix + secret[:8],
		KeyHash: security.HashToken(plain),
	}
	if err := s.DB.CreateAPIKey(ctx, k); err != nil {
		return nil, "", err
	}
	return k, plain, nil
}

// ResolveAPIKey authenticates a bearer key.
func (s *Service) ResolveAPIKey(ctx context.Context, key string) (*storage.APIKey, *storage.User, error) {
	if !strings.HasPrefix(key, APIKeyPrefix) || len(key) > 128 {
		return nil, nil, storage.ErrNotFound
	}
	k, u, err := s.DB.GetAPIKeyByHash(ctx, security.HashToken(key))
	if err != nil {
		return nil, nil, err
	}
	if u.Disabled {
		return nil, nil, ErrDisabled
	}
	_ = s.DB.TouchAPIKey(ctx, k.ID)
	return k, u, nil
}

// NewPasswordReset issues a one-hour reset token for the user.
func (s *Service) NewPasswordReset(ctx context.Context, userID string) (string, error) {
	token := security.RandomToken(32)
	if err := s.DB.CreatePasswordReset(ctx, userID, security.HashToken(token), time.Now().Add(resetTTL).Unix()); err != nil {
		return "", err
	}
	return token, nil
}

// ResetPassword consumes a reset token and sets a new password, revoking all sessions.
func (s *Service) ResetPassword(ctx context.Context, token, password string) (*storage.User, error) {
	if token == "" || len(token) > 128 {
		return nil, storage.ErrNotFound
	}
	userID, err := s.DB.ConsumePasswordReset(ctx, security.HashToken(token))
	if err != nil {
		return nil, err
	}
	u, err := s.DB.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	hash, err := s.HashPassword(password)
	if err != nil {
		return nil, err
	}
	u.PasswordHash = hash
	if err := s.DB.UpdateUser(ctx, u); err != nil {
		return nil, err
	}
	return u, s.DB.DeleteUserSessions(ctx, u.ID, "")
}
