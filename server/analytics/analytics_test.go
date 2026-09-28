package analytics

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/kspkr/QrForge/server/migrations"
	"github.com/kspkr/QrForge/server/storage"
)

func TestParseUserAgent(t *testing.T) {
	cases := []struct {
		ua                  string
		browser, os, device string
	}{
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", "Safari", "iOS", "mobile"},
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1", "Chrome", "iOS", "mobile"},
		{"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", "Safari", "iPadOS", "tablet"},
		{"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36", "Chrome", "Android", "mobile"},
		{"Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Chrome", "Android", "tablet"},
		{"Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36", "Samsung Internet", "Android", "mobile"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0", "Edge", "Windows", "desktop"},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0", "Firefox", "macOS", "desktop"},
		{"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/109.0.0.0", "Opera", "Linux", "desktop"},
		{"something weird", "Other", "Other", "other"},
	}
	for _, c := range cases {
		got := ParseUserAgent(c.ua)
		if got.Browser != c.browser || got.OS != c.os || got.Device != c.device {
			t.Errorf("%s\n got %+v, want %s/%s/%s", c.ua, got, c.browser, c.os, c.device)
		}
	}
}

func TestIsBot(t *testing.T) {
	bots := []string{"", "Googlebot/2.1", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "WhatsApp/2.23", "curl/8.4.0",
		"python-requests/2.31", "Mozilla/5.0 (compatible; Discordbot/2.0)", "TelegramBot (like TwitterBot)", "Go-http-client/1.1"}
	for _, ua := range bots {
		if !IsBot(ua) {
			t.Errorf("%q should be a bot", ua)
		}
	}
	if IsBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1") {
		t.Error("iPhone Safari is not a bot")
	}
}

func TestReferrerAndCountry(t *testing.T) {
	if h := ReferrerHost("https://News.Example.com/path?secret=1"); h != "news.example.com" {
		t.Errorf("got %q", h)
	}
	for _, bad := range []string{"android-app://com.x", "not a url", ""} {
		if h := ReferrerHost(bad); h != "" {
			t.Errorf("%q → %q", bad, h)
		}
	}
	if NormalizeCountry("de") != "DE" || NormalizeCountry("XX") != "" || NormalizeCountry("DEU") != "" || NormalizeCountry("1A") != "" {
		t.Error("country normalisation")
	}
}

func TestRecorderSaltsAndHashes(t *testing.T) {
	db, err := storage.Open("sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "a.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if _, err := migrations.Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	r := NewRecorder(db)
	day1 := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	a, _ := r.VisitorHash(ctx, day1, "1.2.3.4", "ua", "qr1")
	b, _ := r.VisitorHash(ctx, day1.Add(time.Hour), "1.2.3.4", "ua", "qr1")
	c, _ := r.VisitorHash(ctx, day1, "1.2.3.5", "ua", "qr1")
	d, _ := r.VisitorHash(ctx, day1, "1.2.3.4", "ua", "qr2")
	e, _ := r.VisitorHash(ctx, day1.Add(24*time.Hour), "1.2.3.4", "ua", "qr1")
	if a != b {
		t.Error("same visitor on the same day must hash equally")
	}
	if a == c || a == d || a == e {
		t.Error("different IP, code or day must hash differently")
	}
	// A fresh recorder (e.g. after restart) reuses the persisted salt.
	r2 := NewRecorder(db)
	a2, _ := r2.VisitorHash(ctx, day1, "1.2.3.4", "ua", "qr1")
	if a2 != a {
		t.Error("salts must persist across restarts")
	}
	r.nowFn = func() time.Time { return day1.Add(72 * time.Hour) }
	if err := r.RotateSalts(ctx); err != nil {
		t.Fatal(err)
	}
	n, _ := db.Count(ctx, "SELECT COUNT(*) FROM salts")
	if n != 0 {
		t.Fatalf("old salts must be deleted, %d remain", n)
	}
}
