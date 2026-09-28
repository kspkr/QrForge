// Package config loads QRForge server configuration from environment variables.
package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version is the server version reported by /health and /config.
var Version = "0.1.0"

// SMTP holds optional outgoing mail settings. Email is never required:
// without SMTP, password reset links are written to the server log.
type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// Enabled reports whether SMTP delivery is configured.
func (s SMTP) Enabled() bool { return s.Host != "" && s.From != "" }

// RateLimits configures in-memory token buckets (requests per minute).
type RateLimits struct {
	APIPerIP        int // all /api requests per client IP
	APIKeyPerMinute int // requests per API key
	AuthPerIP       int // login/register/reset per IP
	RedirectPerIP   int // /r/{slug} per IP
	PasswordPerIP   int // password-gate attempts per IP
	PasswordPerCode int // password-gate attempts per code per hour (all clients)
	AbusePerHour    int // abuse reports per IP per hour
	LoginPerEmail   int // login attempts per email per hour
}

// Config is the full server configuration.
type Config struct {
	Addr                  string
	BaseURL               *url.URL
	DatabaseURL           string
	WebDir                string
	CookieSecure          bool
	TrustedProxies        []*net.IPNet
	CountryHeader         string
	RegistrationOpen      bool
	AdminEmail            string
	AdminPassword         string
	SMTP                  SMTP
	MaxBodyBytes          int64
	CustomDomainScheme    string
	LogFormat             string
	RateLimits            RateLimits
	SessionTTL            time.Duration
	BcryptCost            int
	DisableBackgroundJobs bool
}

// DefaultRateLimits returns production defaults.
func DefaultRateLimits() RateLimits {
	return RateLimits{
		APIPerIP:        600,
		APIKeyPerMinute: 600,
		AuthPerIP:       10,
		RedirectPerIP:   120,
		PasswordPerIP:   10,
		PasswordPerCode: 60,
		AbusePerHour:    5,
		LoginPerEmail:   20,
	}
}

// Default returns a configuration suitable for local development.
func Default() *Config {
	base, _ := url.Parse("http://localhost:8080")
	return &Config{
		Addr:               ":8080",
		BaseURL:            base,
		DatabaseURL:        "sqlite://data/qrforge.db",
		RegistrationOpen:   true,
		MaxBodyBytes:       1 << 20,
		CustomDomainScheme: "https",
		LogFormat:          "text",
		RateLimits:         DefaultRateLimits(),
		SessionTTL:         30 * 24 * time.Hour,
		BcryptCost:         12,
	}
}

// Load reads configuration from the environment on top of Default().
func Load() (*Config, error) {
	c := Default()
	get := func(key string) string { return strings.TrimSpace(os.Getenv(key)) }

	if v := get("QRFORGE_ADDR"); v != "" {
		c.Addr = v
	} else if v := get("PORT"); v != "" {
		c.Addr = ":" + v
	}
	if v := get("QRFORGE_BASE_URL"); v != "" {
		u, err := url.Parse(strings.TrimRight(v, "/"))
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return nil, fmt.Errorf("QRFORGE_BASE_URL must be an absolute http(s) URL, got %q", v)
		}
		c.BaseURL = u
	}
	if v := get("QRFORGE_DATABASE_URL"); v != "" {
		c.DatabaseURL = v
	}
	c.WebDir = get("QRFORGE_WEB_DIR")

	switch strings.ToLower(get("QRFORGE_COOKIE_SECURE")) {
	case "true", "1", "yes":
		c.CookieSecure = true
	case "false", "0", "no":
		c.CookieSecure = false
	default:
		c.CookieSecure = c.BaseURL.Scheme == "https"
	}

	if v := get("QRFORGE_TRUSTED_PROXIES"); v != "" {
		nets, err := ParseCIDRs(v)
		if err != nil {
			return nil, err
		}
		c.TrustedProxies = nets
	}
	c.CountryHeader = get("QRFORGE_COUNTRY_HEADER")

	switch strings.ToLower(get("QRFORGE_REGISTRATION")) {
	case "", "open":
		c.RegistrationOpen = true
	case "closed":
		c.RegistrationOpen = false
	default:
		return nil, fmt.Errorf("QRFORGE_REGISTRATION must be open or closed")
	}

	c.AdminEmail = get("QRFORGE_ADMIN_EMAIL")
	c.AdminPassword = os.Getenv("QRFORGE_ADMIN_PASSWORD")

	c.SMTP = SMTP{
		Host:     get("QRFORGE_SMTP_HOST"),
		Port:     587,
		Username: get("QRFORGE_SMTP_USERNAME"),
		Password: os.Getenv("QRFORGE_SMTP_PASSWORD"),
		From:     get("QRFORGE_SMTP_FROM"),
	}
	if v := get("QRFORGE_SMTP_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p <= 0 || p > 65535 {
			return nil, fmt.Errorf("QRFORGE_SMTP_PORT must be a port number")
		}
		c.SMTP.Port = p
	}

	if v := get("QRFORGE_MAX_BODY_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 1024 {
			return nil, fmt.Errorf("QRFORGE_MAX_BODY_BYTES must be an integer >= 1024")
		}
		c.MaxBodyBytes = n
	}
	if v := get("QRFORGE_CUSTOM_DOMAIN_SCHEME"); v != "" {
		if v != "http" && v != "https" {
			return nil, fmt.Errorf("QRFORGE_CUSTOM_DOMAIN_SCHEME must be http or https")
		}
		c.CustomDomainScheme = v
	}
	if v := get("QRFORGE_LOG_FORMAT"); v != "" {
		c.LogFormat = v
	}

	limits := map[string]*int{
		"QRFORGE_RATE_LIMIT_API":      &c.RateLimits.APIPerIP,
		"QRFORGE_RATE_LIMIT_API_KEY":  &c.RateLimits.APIKeyPerMinute,
		"QRFORGE_RATE_LIMIT_AUTH":     &c.RateLimits.AuthPerIP,
		"QRFORGE_RATE_LIMIT_REDIRECT": &c.RateLimits.RedirectPerIP,
	}
	for key, dst := range limits {
		if v := get(key); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 {
				return nil, fmt.Errorf("%s must be a positive integer (requests per minute)", key)
			}
			*dst = n
		}
	}
	return c, nil
}

// ParseCIDRs parses a comma separated list of CIDRs or bare IPs.
func ParseCIDRs(list string) ([]*net.IPNet, error) {
	var out []*net.IPNet
	for _, part := range strings.Split(list, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.Contains(part, "/") {
			ip := net.ParseIP(part)
			if ip == nil {
				return nil, fmt.Errorf("invalid trusted proxy %q", part)
			}
			bits := 32
			if ip.To4() == nil {
				bits = 128
			}
			part = fmt.Sprintf("%s/%d", part, bits)
		}
		_, n, err := net.ParseCIDR(part)
		if err != nil {
			return nil, fmt.Errorf("invalid trusted proxy %q: %w", part, err)
		}
		out = append(out, n)
	}
	return out, nil
}

// BaseHost returns the hostname (without port) of the base URL.
func (c *Config) BaseHost() string { return c.BaseURL.Hostname() }

// BaseURLString returns the base URL without a trailing slash.
func (c *Config) BaseURLString() string { return strings.TrimRight(c.BaseURL.String(), "/") }
