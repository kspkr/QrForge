package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	for _, k := range []string{"QRFORGE_ADDR", "PORT", "QRFORGE_BASE_URL", "QRFORGE_DATABASE_URL", "QRFORGE_COOKIE_SECURE", "QRFORGE_REGISTRATION"} {
		t.Setenv(k, "")
	}
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Addr != ":8080" || c.DatabaseURL != "sqlite://data/qrforge.db" || c.CookieSecure || !c.RegistrationOpen {
		t.Fatalf("unexpected defaults: %+v", c)
	}
}

func TestLoadEnv(t *testing.T) {
	t.Setenv("QRFORGE_BASE_URL", "https://qr.example.com/")
	t.Setenv("QRFORGE_REGISTRATION", "closed")
	t.Setenv("QRFORGE_TRUSTED_PROXIES", "10.0.0.0/8, 172.18.0.2")
	t.Setenv("QRFORGE_RATE_LIMIT_REDIRECT", "30")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.BaseURLString() != "https://qr.example.com" || c.BaseHost() != "qr.example.com" {
		t.Fatalf("base url: %s", c.BaseURLString())
	}
	if !c.CookieSecure {
		t.Fatal("https base URL should enable secure cookies automatically")
	}
	if c.RegistrationOpen || len(c.TrustedProxies) != 2 || c.RateLimits.RedirectPerIP != 30 {
		t.Fatalf("env not applied: %+v", c)
	}
}

func TestLoadRejectsInvalid(t *testing.T) {
	cases := map[string]string{
		"QRFORGE_BASE_URL":        "ftp://x",
		"QRFORGE_REGISTRATION":    "maybe",
		"QRFORGE_TRUSTED_PROXIES": "not-an-ip",
		"QRFORGE_SMTP_PORT":       "99999",
		"QRFORGE_MAX_BODY_BYTES":  "10",
	}
	for k, v := range cases {
		t.Run(k, func(t *testing.T) {
			t.Setenv(k, v)
			if _, err := Load(); err == nil {
				t.Fatalf("%s=%s should be rejected", k, v)
			}
		})
	}
}
