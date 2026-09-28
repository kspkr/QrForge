package api

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/kspkr/QrForge/server/config"
)

func TestDynamicRedirectWithUTM(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("r@example.com")
	code := c.createDynamic("https://example.com/landing?ref=flyer&utm_source=keep", map[string]any{
		"utm": map[string]string{"source": "qr", "medium": "print", "campaign": "summer sale"},
	})

	res := c.scan("/r/"+code.str("slug"), iphoneUA)
	if res.Status != http.StatusFound {
		t.Fatalf("expected 302, got %d", res.Status)
	}
	loc := res.Header.Get("Location")
	if !strings.HasPrefix(loc, "https://example.com/landing?ref=flyer&utm_source=keep&") {
		t.Fatalf("existing params must be preserved first: %s", loc)
	}
	u, _ := url.Parse(loc)
	q := u.Query()
	if q.Get("utm_source") != "keep" || q.Get("utm_medium") != "print" || q.Get("utm_campaign") != "summer sale" {
		t.Fatalf("utm merge wrong: %s", loc)
	}
	if res.Header.Get("Cache-Control") != "no-store, max-age=0" {
		t.Fatalf("redirects must not be cached: %q", res.Header.Get("Cache-Control"))
	}

	// Changing the destination takes effect immediately.
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"destination": "https://example.org/new", "utm": nil}), 200)
	res = c.scan("/r/"+code.str("slug"), iphoneUA)
	if res.Header.Get("Location") != "https://example.org/new" {
		t.Fatalf("destination change not applied: %s", res.Header.Get("Location"))
	}
	if res := c.scan("/r/does-not-exist", iphoneUA); res.Status != http.StatusNotFound {
		t.Fatalf("unknown slug: %d", res.Status)
	}
}

func TestDisabledAndExpiredCodes(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("d@example.com")
	code := c.createDynamic("https://example.com", nil)
	path := "/r/" + code.str("slug")

	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"status": "disabled"}), 200)
	res := c.scan(path, iphoneUA)
	if res.Status != http.StatusGone || !strings.Contains(string(res.Body), "disabled") {
		t.Fatalf("disabled code: %d %s", res.Status, res.Body)
	}
	if !strings.Contains(string(res.Body), "/report?slug=") {
		t.Fatal("error pages should link to abuse reporting")
	}
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"status": "active"}), 200)
	if res := c.scan(path, iphoneUA); res.Status != http.StatusFound {
		t.Fatalf("re-enabled code: %d", res.Status)
	}

	// Force expiry in the past directly in the database.
	if _, err := env.db.Exec(context.Background(), "UPDATE qrcodes SET expires_at = ? WHERE id = ?", time.Now().Add(-time.Minute).Unix(), code.str("id")); err != nil {
		t.Fatal(err)
	}
	res = c.scan(path, iphoneUA)
	if res.Status != http.StatusGone || !strings.Contains(string(res.Body), "expired") {
		t.Fatalf("expired code: %d", res.Status)
	}
}

func TestPasswordProtectedRedirect(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("p@example.com")
	code := c.createDynamic("https://example.com/secret", map[string]any{"password": "open sesame"})
	if code.get("has_password") != true || strings.Contains(string(code.Body), "open sesame") {
		t.Fatalf("password handling wrong: %s", code.Body)
	}
	path := "/r/" + code.str("slug")

	res := c.scan(path, iphoneUA)
	if res.Status != 200 || !strings.Contains(string(res.Body), `type="password"`) {
		t.Fatalf("expected password form, got %d", res.Status)
	}

	post := func(pw string) *http.Response {
		req, _ := http.NewRequest("POST", env.srv.URL+path, strings.NewReader(url.Values{"password": {pw}}.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("User-Agent", iphoneUA)
		resp, err := c.http.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		return resp
	}
	if r := post("wrong"); r.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", r.StatusCode)
	}
	r := post("open sesame")
	if r.StatusCode != http.StatusFound || r.Header.Get("Location") != "https://example.com/secret" {
		t.Fatalf("correct password: %d %s", r.StatusCode, r.Header.Get("Location"))
	}

	// Removing the password makes it a plain redirect again.
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"password": ""}), 200)
	if res := c.scan(path, iphoneUA); res.Status != http.StatusFound {
		t.Fatalf("expected redirect after removing password: %d", res.Status)
	}
}

func TestAnalyticsCountsUniquesAndBots(t *testing.T) {
	env := newEnv(t, func(c *config.Config) {
		c.CountryHeader = "CF-IPCountry"
	})
	c := env.client()
	c.register("a@example.com")
	code := c.createDynamic("https://example.com", nil)
	path := "/r/" + code.str("slug")

	scanner := env.client()
	scanner.header.Set("CF-IPCountry", "de")
	scanner.header.Set("Referer", "https://news.example.net/some/private/path?q=1")
	scanner.scan(path, iphoneUA)
	scanner.scan(path, iphoneUA) // same visitor → not unique
	scanner.header.Del("Referer")
	scanner.scan(path, androidUA) // different UA → new visitor
	scanner.scan(path, botUA)     // bots are ignored
	scanner.scan(path, "")        // empty UA ignored
	req, _ := http.NewRequest("HEAD", env.srv.URL+path, nil)
	req.Header.Set("User-Agent", iphoneUA)
	if resp, err := scanner.http.Do(req); err == nil {
		resp.Body.Close() // HEAD requests are not counted
	}

	a := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id")+"/analytics?range=7d", nil), 200)
	if a.num("totals", "total_scans") != 3 || a.num("totals", "unique_scans") != 2 {
		t.Fatalf("totals wrong: %s", a.Body)
	}
	if a.num("totals", "today") != 3 || a.num("totals", "this_week") != 3 || a.num("totals", "this_month") != 3 {
		t.Fatalf("period totals wrong: %s", a.Body)
	}
	series := a.list("timeseries")
	if len(series) != 7 || a.str("range", "granularity") != "day" {
		t.Fatalf("expected 7 zero-filled daily buckets: %s", a.Body)
	}
	last := series[len(series)-1].(map[string]any)
	if last["scans"].(float64) != 3 || last["bucket"] != time.Now().UTC().Format("2006-01-02") {
		t.Fatalf("today's bucket wrong: %v", last)
	}
	if first := series[0].(map[string]any); first["scans"].(float64) != 0 {
		t.Fatalf("older buckets must be zero: %v", first)
	}

	items := func(key string) map[string]float64 {
		out := map[string]float64{}
		for _, it := range a.list(key) {
			m := it.(map[string]any)
			out[m["name"].(string)] = m["count"].(float64)
		}
		return out
	}
	if b := items("browsers"); b["Safari"] != 2 || b["Chrome"] != 1 {
		t.Fatalf("browsers: %v", b)
	}
	if o := items("os"); o["iOS"] != 2 || o["Android"] != 1 {
		t.Fatalf("os: %v", o)
	}
	if d := items("devices"); d["mobile"] != 3 {
		t.Fatalf("devices: %v", d)
	}
	if cn := items("countries"); cn["DE"] != 3 {
		t.Fatalf("countries: %v", cn)
	}
	if ref := items("referrers"); ref["news.example.net"] != 2 || ref["Direct"] != 1 {
		t.Fatalf("referrers must be host-only: %v", ref)
	}

	h := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id")+"/analytics?range=24h", nil), 200)
	if len(h.list("timeseries")) != 24 || h.str("range", "granularity") != "hour" {
		t.Fatalf("24h range: %s", h.Body)
	}
	c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id")+"/analytics?range=forever", nil), 422)
	all := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id")+"/analytics?range=all", nil), 200)
	if all.num("range_totals", "scans") != 3 {
		t.Fatalf("all range: %s", all.Body)
	}

	// No IP addresses or raw user agents are stored.
	rows, err := env.db.Query(context.Background(), "SELECT visitor_hash, browser, os, device, country, referrer_host FROM scans")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var hash, b, o, d, cn, ref string
		if err := rows.Scan(&hash, &b, &o, &d, &cn, &ref); err != nil {
			t.Fatal(err)
		}
		joined := strings.Join([]string{hash, b, o, d, cn, ref}, "|")
		if strings.Contains(joined, "127.0.0.1") || strings.Contains(joined, "Mozilla") || len(hash) != 16 {
			t.Fatalf("scan row leaks personal data: %s", joined)
		}
	}

	// Disabling analytics stops recording.
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"analytics_enabled": false}), 200)
	scanner.scan(path, iphoneUA)
	a = c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id")+"/analytics", nil), 200)
	if a.num("totals", "total_scans") != 3 {
		t.Fatal("scans recorded despite analytics being disabled")
	}

	list := c.mustStatus(c.do("GET", "/api/v1/qrcodes", nil), 200)
	if list.list("data")[0].(map[string]any)["scan_count"].(float64) != 3 {
		t.Fatalf("scan_count: %s", list.Body)
	}
	ov := c.mustStatus(c.do("GET", "/api/v1/analytics/overview", nil), 200)
	if ov.num("totals", "total_scans") != 3 || len(ov.list("top_qrcodes")) != 1 {
		t.Fatalf("overview: %s", ov.Body)
	}
}

func TestRetentionCleanup(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("ret@example.com")
	code := c.createDynamic("https://example.com", nil)
	c.scan("/r/"+code.str("slug"), iphoneUA)
	old := time.Now().Add(-400 * 24 * time.Hour).Unix()
	if _, err := env.db.Exec(context.Background(), "UPDATE scans SET scanned_at = ?", old); err != nil {
		t.Fatal(err)
	}
	env.api.RunMaintenance(context.Background())
	n, _ := env.db.Count(context.Background(), "SELECT COUNT(*) FROM scans")
	if n != 0 {
		t.Fatalf("expected retention to delete old scans, %d left", n)
	}
}

func TestCampaigns(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("cmp@example.com")
	cmp := c.mustStatus(c.do("POST", "/api/v1/campaigns", map[string]any{"name": "Summer", "description": "Flyers", "color": "#4F46E5"}), 201)
	if cmp.str("color") != "#4f46e5" {
		t.Fatalf("color not normalised: %s", cmp.Body)
	}
	c.mustStatus(c.do("POST", "/api/v1/campaigns", map[string]any{"name": ""}), 422)
	c.mustStatus(c.do("POST", "/api/v1/campaigns", map[string]any{"name": "x", "color": "red"}), 422)
	id := cmp.str("id")

	flyer := c.createDynamic("https://example.com/flyer", map[string]any{"name": "Flyer", "campaign_id": id})
	insta := c.createDynamic("https://example.com/insta", map[string]any{"name": "Instagram", "campaign_id": id})
	c.createDynamic("https://example.com/other", nil)

	c.scan("/r/"+flyer.str("slug"), iphoneUA)
	c.scan("/r/"+flyer.str("slug"), androidUA)
	c.scan("/r/"+insta.str("slug"), iphoneUA)

	got := c.mustStatus(c.do("GET", "/api/v1/campaigns/"+id, nil), 200)
	if got.num("qr_count") != 2 || got.num("scan_count") != 3 {
		t.Fatalf("campaign counts: %s", got.Body)
	}
	a := c.mustStatus(c.do("GET", "/api/v1/campaigns/"+id+"/analytics", nil), 200)
	if a.num("totals", "total_scans") != 3 {
		t.Fatalf("campaign analytics: %s", a.Body)
	}
	per := a.list("per_qrcode")
	if len(per) != 2 || per[0].(map[string]any)["name"] != "Flyer" || per[0].(map[string]any)["scans"].(float64) != 2 {
		t.Fatalf("per_qrcode: %s", a.Body)
	}
	filtered := c.mustStatus(c.do("GET", "/api/v1/qrcodes?campaign_id="+id, nil), 200)
	if filtered.num("pagination", "total") != 2 {
		t.Fatalf("campaign filter: %s", filtered.Body)
	}
	c.mustStatus(c.do("PATCH", "/api/v1/campaigns/"+id, map[string]any{"name": "Summer 2026", "color": nil}), 200)
	c.mustStatus(c.do("DELETE", "/api/v1/campaigns/"+id, nil), 204)
	f := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+flyer.str("id"), nil), 200)
	if f.get("campaign_id") != nil {
		t.Fatal("deleting a campaign must unassign its codes")
	}
}

func TestCustomDomains(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("dom@example.com")
	d := c.mustStatus(c.do("POST", "/api/v1/domains", map[string]any{"hostname": "QR.Example.com."}), 201)
	if d.str("hostname") != "qr.example.com" || d.get("verified") != false || d.str("verification_record", "name") != "_qrforge-challenge.qr.example.com" {
		t.Fatalf("domain: %s", d.Body)
	}
	c.mustStatus(c.do("POST", "/api/v1/domains", map[string]any{"hostname": "qr.example.com"}), 409)
	c.mustStatus(c.do("POST", "/api/v1/domains", map[string]any{"hostname": "10.0.0.1"}), 422)
	c.mustStatus(c.do("POST", "/api/v1/domains", map[string]any{"hostname": "localhost"}), 422)

	want := d.str("verification_record", "value")
	env.api.LookupTXT = func(ctx context.Context, name string) ([]string, error) { return []string{"unrelated"}, nil }
	c.mustStatus(c.do("POST", "/api/v1/domains/"+d.str("id")+"/verify", nil), 422)
	env.api.LookupTXT = func(ctx context.Context, name string) ([]string, error) {
		if name != "_qrforge-challenge.qr.example.com" {
			t.Errorf("unexpected lookup %s", name)
		}
		return []string{want}, nil
	}
	anon := env.client()
	anon.mustStatus(anon.do("GET", "/api/v1/domains/check?domain=qr.example.com", nil), 404) // not yet verified
	v := c.mustStatus(c.do("POST", "/api/v1/domains/"+d.str("id")+"/verify", nil), 200)
	if v.get("verified") != true {
		t.Fatalf("verify: %s", v.Body)
	}
	// On-demand TLS check used by reverse proxies such as Caddy.
	anon.mustStatus(anon.do("GET", "/api/v1/domains/check?domain=qr.example.com", nil), 200)
	anon.mustStatus(anon.do("GET", "/api/v1/domains/check?domain=unknown.example.org", nil), 404)
	anon.mustStatus(anon.do("GET", "/api/v1/domains/check?domain=not%20a%20host", nil), 404)

	code := c.createDynamic("https://example.com", map[string]any{"domain_id": d.str("id")})
	if code.str("redirect_url") != "https://qr.example.com/r/"+code.str("slug") {
		t.Fatalf("redirect_url should use the custom domain: %s", code.str("redirect_url"))
	}
	other := c.createDynamic("https://example.com/other", nil)

	scanHost := func(slug, host string) int {
		req, _ := http.NewRequest("GET", env.srv.URL+"/r/"+slug, nil)
		req.Host = host
		req.Header.Set("User-Agent", iphoneUA)
		resp, err := c.http.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if s := scanHost(code.str("slug"), "qr.example.com"); s != 302 {
		t.Fatalf("custom domain should serve its code: %d", s)
	}
	if s := scanHost(other.str("slug"), "qr.example.com"); s != 404 {
		t.Fatalf("custom domain must not serve other codes: %d", s)
	}

	apiKeyClient := env.client()
	key := c.mustStatus(c.do("POST", "/api/v1/api-keys", map[string]string{"name": "k"}), 201).str("key")
	apiKeyClient.apiKey = key
	apiKeyClient.mustStatus(apiKeyClient.do("GET", "/api/v1/domains", nil), 200)
	apiKeyClient.mustStatus(apiKeyClient.do("POST", "/api/v1/domains", map[string]any{"hostname": "x.example.com"}), 403)
	c.mustStatus(c.do("DELETE", "/api/v1/domains/"+d.str("id"), nil), 204)
}
