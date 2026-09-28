// Package settings holds administrator-configurable instance settings,
// persisted in the database and cached in memory.
package settings

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

// Settings are the runtime-tunable abuse and account controls.
type Settings struct {
	RegistrationEnabled      bool     `json:"registration_enabled"`
	MaxQRCodesPerUser        int64    `json:"max_qrcodes_per_user"`
	MaxRedirectLength        int      `json:"max_redirect_length"`
	DomainAllowlist          []string `json:"domain_allowlist"`
	DomainBlocklist          []string `json:"domain_blocklist"`
	BlockPrivateDestinations bool     `json:"block_private_destinations"`
	AnalyticsRetentionDays   int      `json:"analytics_retention_days"`
}

// Defaults returns the settings used before an administrator changes anything.
func Defaults(registrationOpen bool) Settings {
	return Settings{
		RegistrationEnabled:      registrationOpen,
		MaxQRCodesPerUser:        0,
		MaxRedirectLength:        2048,
		DomainAllowlist:          []string{},
		DomainBlocklist:          []string{},
		BlockPrivateDestinations: true,
		AnalyticsRetentionDays:   365,
	}
}

// Store caches settings and writes changes through to the database.
type Store struct {
	db  *storage.DB
	mu  sync.RWMutex
	cur Settings
}

// Load reads persisted settings on top of defaults.
func Load(ctx context.Context, db *storage.DB, defaults Settings) (*Store, error) {
	raw, err := db.LoadSettings(ctx)
	if err != nil {
		return nil, err
	}
	s := defaults
	fields := map[string]any{
		"registration_enabled":       &s.RegistrationEnabled,
		"max_qrcodes_per_user":       &s.MaxQRCodesPerUser,
		"max_redirect_length":        &s.MaxRedirectLength,
		"domain_allowlist":           &s.DomainAllowlist,
		"domain_blocklist":           &s.DomainBlocklist,
		"block_private_destinations": &s.BlockPrivateDestinations,
		"analytics_retention_days":   &s.AnalyticsRetentionDays,
	}
	for key, dst := range fields {
		if v, ok := raw[key]; ok {
			if err := json.Unmarshal(v, dst); err != nil {
				return nil, err
			}
		}
	}
	if s.DomainAllowlist == nil {
		s.DomainAllowlist = []string{}
	}
	if s.DomainBlocklist == nil {
		s.DomainBlocklist = []string{}
	}
	return &Store{db: db, cur: s}, nil
}

// Get returns a copy of the current settings.
func (s *Store) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c := s.cur
	c.DomainAllowlist = append([]string{}, s.cur.DomainAllowlist...)
	c.DomainBlocklist = append([]string{}, s.cur.DomainBlocklist...)
	return c
}

// Save persists all settings.
func (s *Store) Save(ctx context.Context, next Settings) error {
	values := map[string]any{
		"registration_enabled":       next.RegistrationEnabled,
		"max_qrcodes_per_user":       next.MaxQRCodesPerUser,
		"max_redirect_length":        next.MaxRedirectLength,
		"domain_allowlist":           next.DomainAllowlist,
		"domain_blocklist":           next.DomainBlocklist,
		"block_private_destinations": next.BlockPrivateDestinations,
		"analytics_retention_days":   next.AnalyticsRetentionDays,
	}
	for k, v := range values {
		if err := s.db.SaveSetting(ctx, k, v); err != nil {
			return err
		}
	}
	s.mu.Lock()
	s.cur = next
	s.mu.Unlock()
	return nil
}

// Policy returns the destination policy derived from settings.
func (s *Store) Policy(selfHosts ...string) security.DestinationPolicy {
	c := s.Get()
	return security.DestinationPolicy{
		MaxLength:    c.MaxRedirectLength,
		BlockPrivate: c.BlockPrivateDestinations,
		Allowlist:    c.DomainAllowlist,
		Blocklist:    c.DomainBlocklist,
		SelfHosts:    selfHosts,
	}
}
