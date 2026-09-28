package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kspkr/QrForge/server/config"
)

func TestAdminEndpoints(t *testing.T) {
	env := newEnv(t)
	admin := env.client()
	admin.register("admin@example.com")
	user := env.client()
	user.register("user@example.com")
	code := user.createDynamic("https://example.com", nil)
	user.scan("/r/"+code.str("slug"), iphoneUA)

	for _, path := range []string{"/api/v1/admin/overview", "/api/v1/admin/users", "/api/v1/admin/qrcodes", "/api/v1/admin/abuse-reports", "/api/v1/admin/settings", "/api/v1/admin/audit-log"} {
		user.mustStatus(user.do("GET", path, nil), http.StatusForbidden)
		env.client().mustStatus(env.client().do("GET", path, nil), http.StatusUnauthorized)
		admin.mustStatus(admin.do("GET", path, nil), 200)
	}

	ov := admin.mustStatus(admin.do("GET", "/api/v1/admin/overview", nil), 200)
	if ov.num("counts", "users") != 2 || ov.num("counts", "qrcodes") != 1 || ov.num("counts", "scans_total") != 1 || ov.num("counts", "active_redirects") != 1 {
		t.Fatalf("overview counts: %s", ov.Body)
	}
	if ov.str("storage", "driver") == "" || ov.str("system", "database") != "ok" || len(ov.list("traffic")) != 30 {
		t.Fatalf("overview shape: %s", ov.Body)
	}

	users := admin.mustStatus(admin.do("GET", "/api/v1/admin/users", nil), 200)
	var adminID, userID string
	for _, u := range users.list("data") {
		m := u.(map[string]any)
		if m["email"] == "admin@example.com" {
			adminID = m["id"].(string)
		} else {
			userID = m["id"].(string)
			if m["qr_count"].(float64) != 1 {
				t.Fatalf("qr_count: %v", m)
			}
		}
	}
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/users/"+adminID, map[string]any{"role": "user"}), 422)
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/users/"+adminID, map[string]any{"disabled": true}), 422)

	// Admin disables a code: the owner cannot re-enable it.
	qrs := admin.mustStatus(admin.do("GET", "/api/v1/admin/qrcodes", nil), 200)
	if qrs.list("data")[0].(map[string]any)["owner_email"] != "user@example.com" {
		t.Fatalf("owner_email missing: %s", qrs.Body)
	}
	d := admin.mustStatus(admin.do("PATCH", "/api/v1/admin/qrcodes/"+code.str("id"), map[string]any{"status": "disabled", "disabled_reason": "Phishing"}), 200)
	if d.get("admin_locked") != true || d.str("disabled_reason") != "Phishing" {
		t.Fatalf("admin disable: %s", d.Body)
	}
	user.mustStatus(user.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"status": "active"}), http.StatusForbidden)
	if res := user.scan("/r/"+code.str("slug"), iphoneUA); res.Status != http.StatusGone {
		t.Fatalf("admin-disabled code must not redirect: %d", res.Status)
	}
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/qrcodes/"+code.str("id"), map[string]any{"status": "active"}), 200)

	// Disabling a user revokes their sessions and stops their redirects.
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/users/"+userID, map[string]any{"disabled": true}), 200)
	user.mustStatus(user.do("GET", "/api/v1/auth/me", nil), http.StatusUnauthorized)
	if res := user.scan("/r/"+code.str("slug"), iphoneUA); res.Status != http.StatusGone {
		t.Fatalf("disabled owner's code must not redirect: %d", res.Status)
	}
	login := env.client().do("POST", "/api/v1/auth/login", map[string]string{"email": "user@example.com", "password": "correct horse battery"})
	if login.Status != http.StatusForbidden || login.str("error", "code") != "account_disabled" {
		t.Fatalf("disabled login: %d %s", login.Status, login.Body)
	}
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/users/"+userID, map[string]any{"disabled": false, "role": "admin"}), 200)

	st := admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"registration_enabled": false, "analytics_retention_days": 30, "max_redirect_length": 512}), 200)
	if st.get("registration_enabled") != false || st.num("analytics_retention_days") != 30 {
		t.Fatalf("settings: %s", st.Body)
	}
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"max_redirect_length": 10}), 422)
	cfg := env.client().mustStatus(env.client().do("GET", "/api/v1/config", nil), 200)
	if cfg.get("registration_enabled") != false || cfg.num("limits", "max_redirect_length") != 512 {
		t.Fatalf("public config should reflect settings: %s", cfg.Body)
	}

	audit := admin.mustStatus(admin.do("GET", "/api/v1/admin/audit-log?per_page=100", nil), 200)
	actions := map[string]bool{}
	for _, e := range audit.list("data") {
		actions[e.(map[string]any)["action"].(string)] = true
	}
	for _, want := range []string{"auth.register", "qrcode.create", "admin.qrcode_update", "admin.user_update", "admin.settings_update"} {
		if !actions[want] {
			t.Errorf("audit log missing %s", want)
		}
	}
	own := admin.mustStatus(admin.do("GET", "/api/v1/audit-log", nil), 200)
	for _, e := range own.list("data") {
		if e.(map[string]any)["actor_email"] != "admin@example.com" {
			t.Fatal("own audit log must only contain the caller's events")
		}
	}
}

func TestAbuseReportFlow(t *testing.T) {
	env := newEnv(t, func(c *config.Config) { c.RateLimits.AbusePerHour = 3 })
	admin := env.client()
	admin.register("admin@example.com")
	user := env.client()
	user.register("user@example.com")
	code := user.createDynamic("https://example.com/login", nil)

	anon := env.client()
	anon.mustStatus(anon.do("POST", "/api/v1/abuse-reports", map[string]any{"slug": code.str("slug"), "reason": "bogus"}), 422)
	r := anon.mustStatus(anon.do("POST", "/api/v1/abuse-reports", map[string]any{
		"slug": code.str("redirect_url"), "reason": "phishing", "details": "Fake login page", "reporter_email": "Reporter@example.com",
	}), http.StatusAccepted)
	if r.str("status") != "received" {
		t.Fatalf("report: %s", r.Body)
	}

	list := admin.mustStatus(admin.do("GET", "/api/v1/admin/abuse-reports?status=open", nil), 200)
	if list.num("pagination", "total") != 1 {
		t.Fatalf("open reports: %s", list.Body)
	}
	rep := list.list("data")[0].(map[string]any)
	if rep["qrcode_id"] != code.str("id") || rep["slug"] != code.str("slug") || rep["reporter_email"] != "reporter@example.com" {
		t.Fatalf("report fields: %v", rep)
	}
	upd := admin.mustStatus(admin.do("PATCH", "/api/v1/admin/abuse-reports/"+rep["id"].(string), map[string]any{"status": "resolved", "disable_qrcode": true}), 200)
	if upd.str("status") != "resolved" || upd.str("resolved_at") == "" {
		t.Fatalf("resolve: %s", upd.Body)
	}
	got := user.mustStatus(user.do("GET", "/api/v1/qrcodes/"+code.str("id"), nil), 200)
	if got.str("status") != "disabled" || got.get("admin_locked") != true {
		t.Fatalf("reported code should be disabled: %s", got.Body)
	}

	// Public endpoint is rate limited.
	anon.do("POST", "/api/v1/abuse-reports", map[string]any{"slug": "abc123", "reason": "spam"})
	anon.do("POST", "/api/v1/abuse-reports", map[string]any{"slug": "abc123", "reason": "spam"})
	anon.mustStatus(anon.do("POST", "/api/v1/abuse-reports", map[string]any{"slug": "abc123", "reason": "spam"}), http.StatusTooManyRequests)
}

func TestSecurityHeadersAndBodyLimit(t *testing.T) {
	env := newEnv(t, func(c *config.Config) { c.MaxBodyBytes = 64 << 10 })
	c := env.client()
	r := c.do("GET", "/api/v1/health", nil)
	for h, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	} {
		if r.Header.Get(h) != want {
			t.Errorf("%s = %q, want %q", h, r.Header.Get(h), want)
		}
	}
	if !strings.Contains(r.Header.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Error("missing CSP")
	}
	c.register("big@example.com")
	huge := `{"destination":"https://example.com","name":"` + strings.Repeat("x", 100<<10) + `"}`
	big := c.do("POST", "/api/v1/qrcodes", huge)
	if big.Status != http.StatusRequestEntityTooLarge || big.str("error", "code") != "payload_too_large" {
		t.Fatalf("expected 413, got %d %s", big.Status, big.Body)
	}
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", "{not json"), http.StatusBadRequest)
	// Oversized design objects are rejected by field validation.
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "design": "not-an-object"}), 422)
}

func TestRedirectRateLimit(t *testing.T) {
	env := newEnv(t, func(c *config.Config) { c.RateLimits.RedirectPerIP = 3 })
	c := env.client()
	c.register("rl@example.com")
	code := c.createDynamic("https://example.com", nil)
	var last *response
	for i := 0; i < 4; i++ {
		last = c.scan("/r/"+code.str("slug"), iphoneUA)
	}
	if last.Status != http.StatusTooManyRequests || last.Header.Get("Retry-After") == "" {
		t.Fatalf("expected 429, got %d", last.Status)
	}
}

func TestWebSPAServing(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html><title>QRForge</title>"), 0o644); err != nil {
		t.Fatal(err)
	}
	os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	os.WriteFile(filepath.Join(dir, "assets", "app-abc123.js"), []byte("console.log(1)"), 0o644)
	env := newEnv(t, func(c *config.Config) { c.WebDir = dir })
	c := env.client()

	for _, path := range []string{"/", "/studio", "/app/codes/qr_123"} {
		r := c.do("GET", path, nil)
		if r.Status != 200 || !strings.Contains(string(r.Body), "<title>QRForge</title>") {
			t.Fatalf("%s should serve index.html, got %d", path, r.Status)
		}
	}
	a := c.do("GET", "/assets/app-abc123.js", nil)
	if a.Status != 200 || !strings.Contains(a.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("asset caching: %d %q", a.Status, a.Header.Get("Cache-Control"))
	}
	if r := c.do("GET", "/missing.js", nil); r.Status != 404 {
		t.Fatalf("missing files must 404, got %d", r.Status)
	}
	if r := c.do("GET", "/../../etc/passwd", nil); r.Status == 200 && !strings.Contains(string(r.Body), "QRForge") {
		t.Fatal("path traversal")
	}
}
