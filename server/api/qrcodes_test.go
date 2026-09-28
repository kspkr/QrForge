package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestQRCodeCRUDAndPagination(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("owner@example.com")

	r := c.createDynamic("https://example.com/menu", map[string]any{
		"name": "Menu", "utm": map[string]string{"source": "qr", "medium": "print"},
		"design": map[string]any{"foreground": "#111111"}, "form_data": map[string]any{"url": "example.com/menu"},
	})
	id := r.str("id")
	if r.str("kind") != "dynamic" || r.str("qr_type") != "url" || r.str("status") != "active" {
		t.Fatalf("unexpected defaults: %s", r.Body)
	}
	if r.str("content") != r.str("redirect_url") {
		t.Fatal("dynamic content must be the redirect URL")
	}
	if r.str("utm", "source") != "qr" || r.str("design", "foreground") != "#111111" {
		t.Fatalf("utm/design not stored: %s", r.Body)
	}
	if r.get("has_password") != false || r.get("analytics_enabled") != true {
		t.Fatalf("unexpected flags: %s", r.Body)
	}

	static := c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{
		"name": "Wi-Fi", "kind": "static", "qr_type": "wifi", "content": "WIFI:T:WPA;S:Cafe;P:secret;;",
	}), 201)
	if static.get("slug") != nil || static.get("redirect_url") != nil || static.str("content") != "WIFI:T:WPA;S:Cafe;P:secret;;" {
		t.Fatalf("static code shape wrong: %s", static.Body)
	}
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"kind": "static", "qr_type": "nope", "content": "x"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"kind": "static"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"kind": "banana", "destination": "https://example.com"}), 422)

	for i := 0; i < 23; i++ {
		c.createDynamic(fmt.Sprintf("https://example.com/%d", i), map[string]any{"name": fmt.Sprintf("Bulk %02d", i)})
	}
	page1 := c.mustStatus(c.do("GET", "/api/v1/qrcodes?per_page=10", nil), 200)
	if len(page1.list("data")) != 10 || page1.num("pagination", "total") != 25 || page1.num("pagination", "page") != 1 {
		t.Fatalf("pagination wrong: %s", page1.Body)
	}
	page3 := c.mustStatus(c.do("GET", "/api/v1/qrcodes?per_page=10&page=3", nil), 200)
	if len(page3.list("data")) != 5 {
		t.Fatalf("expected 5 on the last page, got %d", len(page3.list("data")))
	}
	statics := c.mustStatus(c.do("GET", "/api/v1/qrcodes?kind=static", nil), 200)
	if statics.num("pagination", "total") != 1 {
		t.Fatalf("kind filter: %s", statics.Body)
	}
	search := c.mustStatus(c.do("GET", "/api/v1/qrcodes?q=menu", nil), 200)
	if search.num("pagination", "total") != 1 {
		t.Fatalf("search: %s", search.Body)
	}
	byName := c.mustStatus(c.do("GET", "/api/v1/qrcodes?sort=name&per_page=1", nil), 200)
	if byName.list("data")[0].(map[string]any)["name"] != "Bulk 00" {
		t.Fatalf("sort by name: %s", byName.Body)
	}
	c.mustStatus(c.do("GET", "/api/v1/qrcodes?sort=password_hash", nil), 422)

	upd := c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{
		"name": "Dinner menu", "destination": "https://example.com/dinner", "utm": nil,
	}), 200)
	if upd.str("name") != "Dinner menu" || upd.str("destination") != "https://example.com/dinner" || upd.get("utm") != nil {
		t.Fatalf("update failed: %s", upd.Body)
	}
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+static.str("id"), map[string]any{"destination": "https://example.com"}), 422)

	hist := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+id+"/history", nil), 200)
	entries := hist.list("data")
	if len(entries) != 2 {
		t.Fatalf("expected 2 history entries: %s", hist.Body)
	}
	newest := entries[0].(map[string]any)
	if newest["destination"] != "https://example.com/dinner" || newest["previous_destination"] != "https://example.com/menu" ||
		newest["changed_by_email"] != "owner@example.com" {
		t.Fatalf("history entry wrong: %v", newest)
	}

	dup := c.mustStatus(c.do("POST", "/api/v1/qrcodes/"+id+"/duplicate", nil), 201)
	if dup.str("name") != "Dinner menu (copy)" || dup.str("slug") == upd.str("slug") || dup.num("scan_count") != 0 {
		t.Fatalf("duplicate wrong: %s", dup.Body)
	}

	c.mustStatus(c.do("DELETE", "/api/v1/qrcodes/"+id, nil), 204)
	c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+id, nil), 404)
	c.mustStatus(c.do("DELETE", "/api/v1/qrcodes/"+id, nil), 404)
}

func TestOwnershipIsolation(t *testing.T) {
	env := newEnv(t)
	alice := env.client()
	alice.register("alice@example.com")
	bob := env.client()
	bob.register("bob@example.com")

	code := alice.createDynamic("https://alice.example.com", nil)
	id := code.str("id")
	cmp := alice.mustStatus(alice.do("POST", "/api/v1/campaigns", map[string]any{"name": "Alice's"}), 201)

	bob.mustStatus(bob.do("GET", "/api/v1/qrcodes/"+id, nil), 404)
	bob.mustStatus(bob.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{"name": "pwned"}), 404)
	bob.mustStatus(bob.do("DELETE", "/api/v1/qrcodes/"+id, nil), 404)
	bob.mustStatus(bob.do("GET", "/api/v1/qrcodes/"+id+"/analytics", nil), 404)
	bob.mustStatus(bob.do("POST", "/api/v1/qrcodes/"+id+"/rotate-slug", nil), 404)
	bob.mustStatus(bob.do("GET", "/api/v1/campaigns/"+cmp.str("id"), nil), 404)
	list := bob.mustStatus(bob.do("GET", "/api/v1/qrcodes", nil), 200)
	if list.num("pagination", "total") != 0 {
		t.Fatal("bob must not see alice's codes")
	}
	// Bob cannot attach his code to Alice's campaign.
	bob.mustStatus(bob.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://bob.example.com", "campaign_id": cmp.str("id")}), 422)
}

func TestSlugsAndRotation(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("slugs@example.com")

	r := c.createDynamic("https://example.com", map[string]any{"slug": "summer-menu"})
	if r.str("slug") != "summer-menu" {
		t.Fatalf("custom slug not used: %s", r.Body)
	}
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "slug": "summer-menu"}), http.StatusConflict)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "slug": "a"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "slug": "../etc"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "slug": "admin"}), 422)

	c.mustStatus(c.scan("/r/summer-menu", iphoneUA), http.StatusFound)
	rot := c.mustStatus(c.do("POST", "/api/v1/qrcodes/"+r.str("id")+"/rotate-slug", nil), 200)
	if rot.str("slug") == "summer-menu" || !strings.HasSuffix(rot.str("redirect_url"), "/r/"+rot.str("slug")) {
		t.Fatalf("rotation failed: %s", rot.Body)
	}
	if res := c.scan("/r/summer-menu", iphoneUA); res.Status != http.StatusNotFound {
		t.Fatalf("old slug must stop resolving, got %d", res.Status)
	}
	if res := c.scan("/r/"+rot.str("slug"), iphoneUA); res.Status != http.StatusFound {
		t.Fatalf("new slug must resolve, got %d", res.Status)
	}
	static := c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"kind": "static", "content": "hello", "qr_type": "text"}), 201)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes/"+static.str("id")+"/rotate-slug", nil), 422)
}

func TestDestinationValidationAndSSRFProtections(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("sec@example.com")

	bad := []string{
		"javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"ftp://example.com/file",
		"//example.com",
		"https://user:pass@example.com",
		"http://127.0.0.1/admin",
		"http://localhost:8080",
		"http://10.0.0.5",
		"http://192.168.1.1",
		"http://169.254.169.254/latest/meta-data",
		"http://[::1]/",
		"http://0x7f000001/",
		"http://printer.local/",
		"http://intranet/",
		"https://example.com/ spaces",
		"https://" + strings.Repeat("a", 2100) + ".com",
		env.srv.URL + "/r/loop",
	}
	for _, dest := range bad {
		r := c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": dest})
		if r.Status != 422 {
			t.Errorf("destination %q should be rejected, got %d: %s", dest, r.Status, r.Body)
		}
	}
	c.createDynamic("https://example.com/ok?x=1#frag", nil)
}

func TestAdminBlocklistAndAllowlist(t *testing.T) {
	env := newEnv(t)
	admin := env.client()
	admin.register("admin@example.com")
	user := env.client()
	user.register("user@example.com")

	code := user.createDynamic("https://sub.evil.example/landing", nil)

	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"domain_blocklist": []string{"*.evil.example", "not a domain!"}}), 422)
	s := admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"domain_blocklist": []string{"*.Evil.example"}}), 200)
	if s.list("domain_blocklist")[0] != "evil.example" {
		t.Fatalf("blocklist not normalised: %s", s.Body)
	}
	r := user.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://evil.example"})
	if r.Status != 422 || r.str("error", "code") != "destination_blocked" {
		t.Fatalf("blocked domain accepted: %d %s", r.Status, r.Body)
	}
	// Existing codes pointing at newly blocked domains stop redirecting.
	if res := user.scan("/r/"+code.str("slug"), iphoneUA); res.Status != http.StatusGone {
		t.Fatalf("expected 410 for blocked destination, got %d", res.Status)
	}

	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"domain_blocklist": []string{}, "domain_allowlist": []string{"example.com"}}), 200)
	user.createDynamic("https://shop.example.com", nil)
	user.mustStatus(user.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://other.org"}), 422)
}

func TestPerAccountLimit(t *testing.T) {
	env := newEnv(t)
	admin := env.client()
	admin.register("admin@example.com")
	user := env.client()
	user.register("user@example.com")
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/settings", map[string]any{"max_qrcodes_per_user": 2}), 200)

	user.createDynamic("https://example.com/1", nil)
	user.createDynamic("https://example.com/2", nil)
	r := user.mustStatus(user.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com/3"}), http.StatusForbidden)
	if r.str("error", "code") != "limit_reached" {
		t.Fatalf("expected limit_reached: %s", r.Body)
	}
	// Per-user override takes precedence.
	users := admin.mustStatus(admin.do("GET", "/api/v1/admin/users?q=user@", nil), 200)
	uid := users.list("data")[0].(map[string]any)["id"].(string)
	admin.mustStatus(admin.do("PATCH", "/api/v1/admin/users/"+uid, map[string]any{"max_qrcodes": 5}), 200)
	user.createDynamic("https://example.com/3", nil)
}

func TestExpiryValidation(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("exp@example.com")
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "expires_at": "yesterday"}), 422)
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"destination": "https://example.com", "expires_at": past}), 422)
	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	r := c.createDynamic("https://example.com", map[string]any{"expires_at": future})
	if r.str("expires_at") == "" {
		t.Fatal("expires_at not stored")
	}
	r = c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+r.str("id"), map[string]any{"expires_at": nil}), 200)
	if r.get("expires_at") != nil {
		t.Fatal("expires_at not cleared")
	}
}
