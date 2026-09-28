package security

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kspkr/QrForge/server/config"
)

func TestValidateDestination(t *testing.T) {
	p := DestinationPolicy{MaxLength: 100, BlockPrivate: true, SelfHosts: []string{"qr.example.org"}}
	ok := map[string]string{
		"https://example.com":                   "https://example.com",
		"HTTPS://Example.com/Path?q=1#top":      "https://Example.com/Path?q=1#top",
		"http://example.com:8080/x":             "http://example.com:8080/x",
		"https://münchen.de":                    "https://xn--mnchen-3ya.de",
		"https://8.8.8.8/dns":                   "https://8.8.8.8/dns",
		"https://qr.example.org/not-a-redirect": "https://qr.example.org/not-a-redirect",
	}
	for in, want := range ok {
		got, err := p.ValidateDestination(in)
		if err != nil {
			t.Errorf("%q rejected: %v", in, err)
			continue
		}
		if got != want && !strings.EqualFold(got, want) {
			t.Errorf("%q normalised to %q, want %q", in, got, want)
		}
	}
	bad := []string{
		"", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd",
		"mailto:a@b.co", "//example.com", "/relative", "https://", "https://user@example.com", "https://u:p@example.com",
		"http://127.0.0.1", "http://127.1.2.3:80", "http://10.1.2.3", "http://172.16.0.1", "http://192.168.0.1",
		"http://169.254.169.254", "http://100.64.0.1", "http://0.0.0.0", "http://[::1]", "http://[fe80::1]", "http://[fc00::1]",
		"http://localhost", "http://api.localhost", "http://nas.local", "http://db.internal", "http://router",
		"http://2130706433", "http://0x7f.1", "http://1.2.3.04", "https://example.com/a b", "https://example.com/\x00",
		"https://qr.example.org/r/abc", "https://" + strings.Repeat("a", 100) + ".com",
	}
	for _, in := range bad {
		if _, err := p.ValidateDestination(in); err == nil {
			t.Errorf("%q should be rejected", in)
		}
	}

	open := DestinationPolicy{BlockPrivate: false}
	if _, err := open.ValidateDestination("http://192.168.1.10/intranet"); err != nil {
		t.Errorf("private destinations allowed when BlockPrivate=false: %v", err)
	}
	if _, err := open.ValidateDestination("javascript:alert(1)"); err == nil {
		t.Error("scheme checks must always apply")
	}
}

func TestBlockAndAllowLists(t *testing.T) {
	p := DestinationPolicy{Blocklist: []string{"evil.com"}, BlockPrivate: true}
	for _, in := range []string{"https://evil.com", "https://a.b.evil.com/x", "https://EVIL.com."} {
		_, err := p.ValidateDestination(in)
		de, ok := IsDestinationError(err)
		if !ok || de.Code != "destination_blocked" {
			t.Errorf("%q should be blocked, got %v", in, err)
		}
	}
	if _, err := p.ValidateDestination("https://notevil.com"); err != nil {
		t.Errorf("suffix match must respect label boundaries: %v", err)
	}
	a := DestinationPolicy{Allowlist: []string{"example.com"}}
	if _, err := a.ValidateDestination("https://shop.example.com"); err != nil {
		t.Error(err)
	}
	if _, err := a.ValidateDestination("https://example.com.evil.net"); err == nil {
		t.Error("allowlist bypass")
	}
}

func TestNormalizeHostname(t *testing.T) {
	good := map[string]string{"QR.Example.COM.": "qr.example.com", " a-b.example.io ": "a-b.example.io"}
	for in, want := range good {
		got, err := NormalizeHostname(in)
		if err != nil || got != want {
			t.Errorf("%q → %q, %v", in, got, err)
		}
	}
	for _, in := range []string{"", "localhost", "1.2.3.4", "-bad.com", "bad-.com", "a..com", "exa mple.com", "x.123", "under_score.com"} {
		if _, err := NormalizeHostname(in); err == nil {
			t.Errorf("%q should be rejected", in)
		}
	}
}

func TestLimiter(t *testing.T) {
	l := NewLimiter(3, time.Minute)
	now := time.Unix(1_000_000, 0)
	l.SetClock(func() time.Time { return now })
	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("k"); !ok {
			t.Fatalf("request %d should pass", i)
		}
	}
	ok, wait := l.Allow("k")
	if ok || wait <= 0 || wait > 21*time.Second {
		t.Fatalf("expected block with ~20s wait, got ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("other"); !ok {
		t.Fatal("keys are independent")
	}
	now = now.Add(20 * time.Second)
	if ok, _ := l.Allow("k"); !ok {
		t.Fatal("token should refill after 20s")
	}
	now = now.Add(10 * time.Minute)
	l.Allow("fresh")
	if l.Len() != 1 {
		t.Fatalf("idle buckets should be cleaned up, have %d", l.Len())
	}
}

func TestClientIP(t *testing.T) {
	trusted, _ := config.ParseCIDRs("10.0.0.0/8")
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "203.0.113.9:1234"
	r.Header.Set("X-Forwarded-For", "1.1.1.1")
	if ip := ClientIP(r, trusted); ip != "203.0.113.9" {
		t.Fatalf("untrusted peer must not be able to spoof XFF, got %s", ip)
	}
	r.RemoteAddr = "10.0.0.2:1234"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 198.51.100.7, 10.0.0.3")
	if ip := ClientIP(r, trusted); ip != "198.51.100.7" {
		t.Fatalf("expected rightmost untrusted hop, got %s", ip)
	}
	r.Header.Del("X-Forwarded-For")
	r.Header.Set("X-Real-IP", "198.51.100.8")
	if ip := ClientIP(r, trusted); ip != "198.51.100.8" {
		t.Fatalf("X-Real-IP from trusted proxy, got %s", ip)
	}
}

func TestTokens(t *testing.T) {
	a, b := RandomToken(32), RandomToken(32)
	if a == b || len(a) != 43 {
		t.Fatalf("bad tokens %q %q", a, b)
	}
	if HashToken(a) == a || len(HashToken(a)) != 64 || HashToken(a) != HashToken(a) {
		t.Fatal("hash")
	}
	if !Equal("x", "x") || Equal("x", "y") {
		t.Fatal("equal")
	}
}
