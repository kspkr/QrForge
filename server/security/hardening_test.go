package security

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Look-alike encodings of a blocked host must not bypass the blocklist:
// browsers map full-width and Unicode hostnames to the same ASCII host.
func TestBlocklistCannotBeBypassedWithIDNA(t *testing.T) {
	p := DestinationPolicy{BlockPrivate: true, Blocklist: []string{"evil.com", "bücher.de"}}
	for _, dest := range []string{
		"https://ｅｖｉｌ.com/login",         // full-width letters
		"https://EVIL.com",               // case
		"https://evil.com./x",            // trailing dot
		"https://login.ｅvil.com",         // mixed, subdomain
		"https://xn--bcher-kva.de",       // punycode of a Unicode blocklist entry
		"https://shop.xn--bcher-kva.de/", // subdomain of it
	} {
		if _, err := p.ValidateDestination(dest); err == nil {
			t.Errorf("%q bypassed the blocklist", dest)
		}
	}
	a := DestinationPolicy{Allowlist: []string{"xn--bcher-kva.de"}}
	got, err := a.ValidateDestination("https://bücher.de/katalog")
	if err != nil || got != "https://xn--bcher-kva.de/katalog" {
		t.Fatalf("allowlisted Unicode host: got %q, %v", got, err)
	}
	// Zero-width characters are dropped by browsers (IDNA "ignored"), so the
	// host is checked as the plain domain a browser would visit.
	if _, err := (DestinationPolicy{Blocklist: []string{"example.com"}}).ValidateDestination("https://ex​ample.com"); err == nil {
		t.Error("zero-width character bypassed the blocklist")
	}
}

// Redirect chaining back into our own /r/ must be refused however the path is spelled.
func TestSelfRedirectLoopWithUncleanPaths(t *testing.T) {
	p := DestinationPolicy{SelfHosts: []string{"qr.example.org"}}
	for _, dest := range []string{
		"https://qr.example.org//r/abc", "https://qr.example.org/x/../r/abc", "https://qr.example.org/./r/abc",
	} {
		if _, err := p.ValidateDestination(dest); err == nil {
			t.Errorf("%q was accepted", dest)
		}
	}
}

func TestIPKeyGroupsIPv6By64(t *testing.T) {
	if IPKey("2001:db8:1:2:aaaa::1") != IPKey("2001:db8:1:2:ffff::9") {
		t.Error("addresses in the same /64 must share a rate-limit key")
	}
	if IPKey("2001:db8:1:2::1") == IPKey("2001:db8:1:3::1") {
		t.Error("different /64s must not share a key")
	}
	if IPKey("203.0.113.7") != "203.0.113.7" {
		t.Error("IPv4 keys must be the address itself")
	}
}

func TestLimiterMemoryIsBounded(t *testing.T) {
	l := NewLimiter(5, time.Minute)
	now := time.Unix(1_000_000, 0)
	l.SetClock(func() time.Time { return now })
	for i := 0; i < maxKeys+5000; i++ {
		l.Allow(fmt.Sprintf("k%d", i))
	}
	if n := l.Len(); n > maxKeys {
		t.Fatalf("limiter grew to %d keys, cap is %d", n, maxKeys)
	}
}

func TestPermissionsPolicyAllowsSameOriginGeolocation(t *testing.T) {
	rec := httptest.NewRecorder()
	Headers(false, nopHandler{}).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if got := rec.Header().Get("Permissions-Policy"); got != "camera=(), microphone=(), geolocation=(self)" {
		t.Fatalf("Permissions-Policy = %q", got)
	}
}

type nopHandler struct{}

func (nopHandler) ServeHTTP(http.ResponseWriter, *http.Request) {}
