package api

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/kspkr/QrForge/server/config"
)

// bcrypt only uses 72 bytes and x/crypto rejects longer input; such passwords
// must be a validation error, never a 500.
func TestLongPasswordsAreRejectedCleanly(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	long := strings.Repeat("a", 73)
	r := c.do("POST", "/api/v1/auth/register", map[string]string{"email": "long@example.com", "password": long})
	if r.Status != http.StatusUnprocessableEntity || r.str("error", "fields", "password") == "" {
		t.Fatalf("register with 73-byte password: %d %s", r.Status, r.Body)
	}
	c.register("ok@example.com")
	code := c.createDynamic("https://example.com", nil)
	r = c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"password": long})
	if r.Status != http.StatusUnprocessableEntity {
		t.Fatalf("QR password of 73 bytes: %d %s", r.Status, r.Body)
	}
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"password": strings.Repeat("b", 72)}), http.StatusOK)
	r = env.client().do("POST", "/api/v1/auth/login", map[string]string{"email": "ok@example.com", "password": long})
	if r.Status != http.StatusUnauthorized {
		t.Fatalf("login with 73-byte password: %d %s", r.Status, r.Body)
	}
}

// A stolen session must not be enough to take over the account by changing
// the email address (which would redirect password resets).
func TestChangingEmailRequiresCurrentPassword(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("owner@example.com")
	r := c.do("PATCH", "/api/v1/auth/me", map[string]any{"email": "attacker@example.com"})
	if r.Status != http.StatusUnprocessableEntity || r.str("error", "fields", "current_password") == "" {
		t.Fatalf("email change without password: %d %s", r.Status, r.Body)
	}
	r = c.do("PATCH", "/api/v1/auth/me", map[string]any{"email": "attacker@example.com", "current_password": "wrong password"})
	if r.Status != http.StatusUnprocessableEntity {
		t.Fatalf("email change with wrong password: %d %s", r.Status, r.Body)
	}
	// Unchanged email and name-only updates need no password.
	c.mustStatus(c.do("PATCH", "/api/v1/auth/me", map[string]any{"name": "New name", "email": "owner@example.com"}), http.StatusOK)
	r = c.mustStatus(c.do("PATCH", "/api/v1/auth/me", map[string]any{"email": "new@example.com", "current_password": "correct horse battery"}), http.StatusOK)
	if r.str("user", "email") != "new@example.com" {
		t.Fatalf("email not updated: %s", r.Body)
	}
}

// Password-protected links are limited per code, not just per client IP,
// so a distributed attacker can't brute-force one link.
func TestPasswordGateIsLimitedPerCode(t *testing.T) {
	env := newEnv(t, func(c *config.Config) {
		c.RateLimits.PasswordPerIP = 1000
		c.RateLimits.PasswordPerCode = 3
	})
	c := env.client()
	c.register("gate@example.com")
	code := c.createDynamic("https://example.com", map[string]any{"password": "hunter22"})
	slug := code.str("slug")
	post := func(pw string) int {
		res, err := c.http.PostForm(env.srv.URL+"/r/"+slug, url.Values{"password": {pw}})
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	for i := 0; i < 3; i++ {
		if s := post("wrong"); s != http.StatusUnauthorized {
			t.Fatalf("attempt %d: status %d", i+1, s)
		}
	}
	if s := post("hunter22"); s != http.StatusTooManyRequests {
		t.Fatalf("attempts beyond the per-code limit must be refused, got %d", s)
	}
	// Other codes are unaffected.
	other := c.createDynamic("https://example.com/2", map[string]any{"password": "hunter22"})
	res, err := c.http.PostForm(env.srv.URL+"/r/"+other.str("slug"), url.Values{"password": {"hunter22"}})
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusFound {
		t.Fatalf("other code: status %d", res.StatusCode)
	}
}

// An unverified domain claim must not block the real owner forever.
func TestStaleUnverifiedDomainClaimsCanBeTakenOver(t *testing.T) {
	env := newEnv(t)
	squatter := env.client()
	squatter.register("squatter@example.com")
	squatter.mustStatus(squatter.do("POST", "/api/v1/domains", map[string]any{"hostname": "qr.victim.com"}), http.StatusCreated)

	owner := env.client()
	owner.register("owner@victim.com")
	owner.mustStatus(owner.do("POST", "/api/v1/domains", map[string]any{"hostname": "qr.victim.com"}), http.StatusConflict)

	old := time.Now().Add(-25 * time.Hour).Unix()
	if _, err := env.db.Exec(context.Background(), "UPDATE domains SET created_at = ?", old); err != nil {
		t.Fatal(err)
	}
	d := owner.mustStatus(owner.do("POST", "/api/v1/domains", map[string]any{"hostname": "qr.victim.com"}), http.StatusCreated)
	if len(squatter.mustStatus(squatter.do("GET", "/api/v1/domains", nil), http.StatusOK).list("data")) != 0 {
		t.Fatal("stale claim should have been released")
	}

	// Verified domains are never released.
	env.api.LookupTXT = func(context.Context, string) ([]string, error) {
		return []string{d.str("verification_record", "value")}, nil
	}
	owner.mustStatus(owner.do("POST", "/api/v1/domains/"+d.str("id")+"/verify", nil), http.StatusOK)
	if _, err := env.db.Exec(context.Background(), "UPDATE domains SET created_at = ?", old); err != nil {
		t.Fatal(err)
	}
	squatter.mustStatus(squatter.do("POST", "/api/v1/domains", map[string]any{"hostname": "qr.victim.com"}), http.StatusConflict)
}
