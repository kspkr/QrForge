package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/kspkr/QrForge/server/config"
)

func TestHealthAndConfig(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	r := c.mustStatus(c.do("GET", "/api/v1/health", nil), 200)
	if r.str("status") != "ok" || r.str("database") != "ok" {
		t.Fatalf("unexpected health: %s", r.Body)
	}
	r = c.mustStatus(c.do("GET", "/api/v1/config", nil), 200)
	if r.get("setup_required") != true || r.get("registration_enabled") != true {
		t.Fatalf("fresh instance should require setup: %s", r.Body)
	}
	if r.num("limits", "max_redirect_length") != 2048 {
		t.Fatalf("unexpected limits: %s", r.Body)
	}
	c.mustStatus(c.do("GET", "/api/v1/openapi.yaml", nil), 200)
	c.mustStatus(c.do("GET", "/api/v1/nope", nil), 404)
}

func TestRegisterLoginLogoutMe(t *testing.T) {
	env := newEnv(t)
	c := env.client()

	r := c.register("Admin@Example.com")
	if r.str("user", "email") != "admin@example.com" {
		t.Fatalf("email not normalised: %s", r.Body)
	}
	if r.str("user", "role") != "admin" {
		t.Fatal("first user must become admin")
	}
	if r.str("csrf_token") == "" {
		t.Fatal("missing csrf token")
	}
	cookie := r.Header.Get("Set-Cookie")
	if !strings.Contains(cookie, "HttpOnly") || !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("session cookie flags missing: %s", cookie)
	}

	me := c.mustStatus(c.do("GET", "/api/v1/auth/me", nil), 200)
	if me.str("user", "email") != "admin@example.com" {
		t.Fatalf("me: %s", me.Body)
	}

	second := env.client()
	r = second.register("user@example.com")
	if r.str("user", "role") != "user" {
		t.Fatal("second user must not be admin")
	}
	second.mustStatus(second.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "correct horse battery",
	}), http.StatusConflict)

	// Logout requires CSRF and invalidates the session.
	c.csrf = ""
	c.mustStatus(c.do("POST", "/api/v1/auth/logout", nil), http.StatusForbidden)
	c.csrf = me.str("csrf_token")
	c.mustStatus(c.do("POST", "/api/v1/auth/logout", nil), http.StatusNoContent)
	c.mustStatus(c.do("GET", "/api/v1/auth/me", nil), http.StatusUnauthorized)

	// Login again.
	c.csrf = ""
	bad := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "admin@example.com", "password": "wrong password"})
	c.mustStatus(bad, http.StatusUnauthorized)
	if bad.str("error", "code") != "invalid_credentials" {
		t.Fatalf("expected invalid_credentials: %s", bad.Body)
	}
	unknown := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "ghost@example.com", "password": "whatever123"})
	if unknown.str("error", "code") != "invalid_credentials" {
		t.Fatal("unknown email must look identical to a wrong password")
	}
	ok := c.mustStatus(c.do("POST", "/api/v1/auth/login", map[string]string{"email": "ADMIN@example.com", "password": "correct horse battery"}), 200)
	c.csrf = ok.str("csrf_token")
	c.mustStatus(c.do("GET", "/api/v1/auth/me", nil), 200)
}

func TestRegistrationValidationAndClosedRegistration(t *testing.T) {
	env := newEnv(t, func(c *config.Config) { c.RegistrationOpen = false })
	c := env.client()
	r := c.mustStatus(c.do("POST", "/api/v1/auth/register", map[string]string{"email": "nope", "password": "short"}), 422)
	fields, _ := r.get("error", "fields").(map[string]any)
	if fields["email"] == nil || fields["password"] == nil {
		t.Fatalf("expected field errors: %s", r.Body)
	}
	// The first account is always allowed so an instance can be set up.
	c.register("owner@example.com")
	other := env.client()
	r = other.mustStatus(other.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "late@example.com", "password": "correct horse battery",
	}), http.StatusForbidden)
	if r.str("error", "code") != "registration_closed" {
		t.Fatalf("expected registration_closed: %s", r.Body)
	}
}

func TestCSRFEnforcement(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("a@example.com")
	token := c.csrf

	c.csrf = ""
	r := c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]string{"destination": "https://example.com"}), http.StatusForbidden)
	if r.str("error", "code") != "csrf_failed" {
		t.Fatalf("expected csrf_failed: %s", r.Body)
	}
	c.csrf = "wrong"
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]string{"destination": "https://example.com"}), http.StatusForbidden)

	// Cross-site Origin is rejected even with a valid token.
	c.csrf = token
	c.header.Set("Origin", "https://evil.example")
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]string{"destination": "https://example.com"}), http.StatusForbidden)
	c.header.Del("Origin")

	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]string{"destination": "https://example.com"}), http.StatusCreated)
	// Safe methods don't need a token.
	c.csrf = ""
	c.mustStatus(c.do("GET", "/api/v1/qrcodes", nil), 200)
}

func TestAPIKeys(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("dev@example.com")

	created := c.mustStatus(c.do("POST", "/api/v1/api-keys", map[string]string{"name": "CI"}), http.StatusCreated)
	key := created.str("key")
	if !strings.HasPrefix(key, "qrf_") || len(key) != 36 {
		t.Fatalf("unexpected key format %q", key)
	}
	prefix := created.str("api_key", "prefix")
	if !strings.HasPrefix(key, prefix) {
		t.Fatal("prefix must match the key")
	}

	// The plaintext key is never exposed again.
	list := c.mustStatus(c.do("GET", "/api/v1/api-keys", nil), 200)
	if strings.Contains(string(list.Body), key) {
		t.Fatal("key must not be re-exposed")
	}
	var stored string
	if err := env.db.QueryRow(context.Background(), "SELECT key_hash FROM api_keys").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, key[4:]) {
		t.Fatal("key must be stored hashed")
	}

	bot := env.client()
	bot.apiKey = key
	r := bot.mustStatus(bot.do("POST", "/api/v1/qrcodes", map[string]string{"name": "From API", "type": "dynamic", "destination": "https://example.com"}), 201)
	if !strings.HasPrefix(r.str("id"), "qr_") || r.str("slug") == "" || !strings.Contains(r.str("redirect_url"), "/r/"+r.str("slug")) {
		t.Fatalf("unexpected create response: %s", r.Body)
	}
	bot.mustStatus(bot.do("GET", "/api/v1/qrcodes", nil), 200)

	// Keys cannot manage keys or reach admin endpoints.
	bot.mustStatus(bot.do("GET", "/api/v1/api-keys", nil), http.StatusForbidden)
	bot.mustStatus(bot.do("GET", "/api/v1/admin/overview", nil), http.StatusForbidden)

	usage := c.mustStatus(c.do("GET", "/api/v1/api-keys", nil), 200)
	if usage.list("data")[0].(map[string]any)["usage_count"].(float64) < 2 {
		t.Fatalf("usage not tracked: %s", usage.Body)
	}

	// Revoked keys stop working.
	c.mustStatus(c.do("DELETE", "/api/v1/api-keys/"+created.str("api_key", "id"), nil), http.StatusNoContent)
	bot.mustStatus(bot.do("GET", "/api/v1/qrcodes", nil), http.StatusUnauthorized)

	bad := env.client()
	bad.apiKey = "qrf_notarealkey"
	bad.mustStatus(bad.do("GET", "/api/v1/qrcodes", nil), http.StatusUnauthorized)
}

func TestPasswordChangeAndReset(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("reset@example.com")

	other := env.client()
	lr := other.mustStatus(other.do("POST", "/api/v1/auth/login", map[string]string{"email": "reset@example.com", "password": "correct horse battery"}), 200)
	other.csrf = lr.str("csrf_token")

	c.mustStatus(c.do("POST", "/api/v1/auth/password/change", map[string]string{"current_password": "nope", "new_password": "another good password"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/auth/password/change", map[string]string{"current_password": "correct horse battery", "new_password": "another good password"}), 204)
	// Other sessions are revoked; the current one survives.
	other.mustStatus(other.do("GET", "/api/v1/auth/me", nil), 401)
	c.mustStatus(c.do("GET", "/api/v1/auth/me", nil), 200)

	anon := env.client()
	anon.mustStatus(anon.do("POST", "/api/v1/auth/password/forgot", map[string]string{"email": "ghost@example.com"}), http.StatusAccepted)
	anon.mustStatus(anon.do("POST", "/api/v1/auth/password/forgot", map[string]string{"email": "reset@example.com"}), http.StatusAccepted)

	// Issue a token directly (the HTTP flow only logs/emails it).
	u, err := env.db.GetUserByEmail(context.Background(), "reset@example.com")
	if err != nil {
		t.Fatal(err)
	}
	token, err := env.api.Auth.NewPasswordReset(context.Background(), u.ID)
	if err != nil {
		t.Fatal(err)
	}
	anon.mustStatus(anon.do("POST", "/api/v1/auth/password/reset", map[string]string{"token": "bogus", "password": "brand new password"}), 422)
	anon.mustStatus(anon.do("POST", "/api/v1/auth/password/reset", map[string]string{"token": token, "password": "brand new password"}), 204)
	// Tokens are single-use and all sessions are revoked.
	anon.mustStatus(anon.do("POST", "/api/v1/auth/password/reset", map[string]string{"token": token, "password": "brand new password 2"}), 422)
	c.mustStatus(c.do("GET", "/api/v1/auth/me", nil), 401)
	anon.mustStatus(anon.do("POST", "/api/v1/auth/login", map[string]string{"email": "reset@example.com", "password": "brand new password"}), 200)
}

func TestAuthRateLimit(t *testing.T) {
	env := newEnv(t, func(c *config.Config) { c.RateLimits.AuthPerIP = 5 })
	c := env.client()
	var last *response
	for i := 0; i < 6; i++ {
		last = c.do("POST", "/api/v1/auth/login", map[string]string{"email": "x@example.com", "password": "whatever123"})
	}
	c.mustStatus(last, http.StatusTooManyRequests)
	if last.Header.Get("Retry-After") == "" || last.str("error", "code") != "rate_limited" {
		t.Fatalf("expected Retry-After and rate_limited: %s", last.Body)
	}
}
