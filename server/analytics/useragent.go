// Package analytics implements QRForge's privacy-friendly scan analytics:
// coarse user-agent classification, bot filtering, daily-salted visitor
// hashing (no IPs stored) and portable aggregation queries.
package analytics

import (
	"net/url"
	"strings"
)

// Client is the coarse classification of a user agent.
type Client struct {
	Browser string
	OS      string
	Device  string // mobile | tablet | desktop | other
}

var botMarkers = []string{
	"bot", "crawl", "spider", "slurp", "facebookexternalhit", "facebookcatalog", "preview", "whatsapp",
	"telegram", "discord", "skypeuripreview", "embedly", "quora link", "outbrain", "pinterest",
	"vkshare", "w3c_validator", "curl/", "wget/", "python-requests", "python-urllib", "go-http-client",
	"httpclient", "okhttp", "java/", "libwww", "headlesschrome", "phantomjs", "lighthouse", "pingdom",
	"uptime", "monitor", "scanner", "axios/", "node-fetch", "undici",
}

// IsBot reports whether a user agent belongs to a crawler, link-preview
// fetcher, monitoring tool or scripted HTTP client. Empty agents count as bots.
func IsBot(ua string) bool {
	if strings.TrimSpace(ua) == "" {
		return true
	}
	l := strings.ToLower(ua)
	for _, m := range botMarkers {
		if strings.Contains(l, m) {
			return true
		}
	}
	return false
}

// ParseUserAgent classifies a user agent into browser, OS and device category.
// Order matters: many browsers include other browsers' tokens.
func ParseUserAgent(ua string) Client {
	l := strings.ToLower(ua)
	c := Client{Browser: "Other", OS: "Other", Device: "desktop"}

	switch {
	case strings.Contains(l, "edg/") || strings.Contains(l, "edga/") || strings.Contains(l, "edgios/"):
		c.Browser = "Edge"
	case strings.Contains(l, "opr/") || strings.Contains(l, "opera"):
		c.Browser = "Opera"
	case strings.Contains(l, "samsungbrowser/"):
		c.Browser = "Samsung Internet"
	case strings.Contains(l, "yabrowser/"):
		c.Browser = "Yandex"
	case strings.Contains(l, "ucbrowser/"):
		c.Browser = "UC Browser"
	case strings.Contains(l, "vivaldi/"):
		c.Browser = "Vivaldi"
	case strings.Contains(l, "brave"):
		c.Browser = "Brave"
	case strings.Contains(l, "duckduckgo/"):
		c.Browser = "DuckDuckGo"
	case strings.Contains(l, "firefox/") || strings.Contains(l, "fxios/"):
		c.Browser = "Firefox"
	case strings.Contains(l, "crios/") || strings.Contains(l, "chrome/") || strings.Contains(l, "chromium/"):
		c.Browser = "Chrome"
	case strings.Contains(l, "safari/") || (strings.Contains(l, "applewebkit/") && (strings.Contains(l, "iphone") || strings.Contains(l, "ipad"))):
		c.Browser = "Safari"
	case strings.Contains(l, "msie") || strings.Contains(l, "trident/"):
		c.Browser = "Internet Explorer"
	}

	switch {
	case strings.Contains(l, "iphone") || strings.Contains(l, "ipod"):
		c.OS = "iOS"
	case strings.Contains(l, "ipad"):
		c.OS = "iPadOS"
	case strings.Contains(l, "android"):
		c.OS = "Android"
	case strings.Contains(l, "windows"):
		c.OS = "Windows"
	case strings.Contains(l, "cros"):
		c.OS = "ChromeOS"
	case strings.Contains(l, "mac os x") || strings.Contains(l, "macintosh"):
		c.OS = "macOS"
	case strings.Contains(l, "linux") || strings.Contains(l, "x11"):
		c.OS = "Linux"
	}

	switch {
	case strings.Contains(l, "ipad") || strings.Contains(l, "tablet") ||
		(strings.Contains(l, "android") && !strings.Contains(l, "mobile")):
		c.Device = "tablet"
	case strings.Contains(l, "mobi") || strings.Contains(l, "iphone") || strings.Contains(l, "ipod"):
		c.Device = "mobile"
	case c.OS == "Other" && c.Browser == "Other":
		c.Device = "other"
	}
	return c
}

// ReferrerHost extracts just the host from a Referer header (no path or query,
// which may contain personal data).
func ReferrerHost(ref string) string {
	if ref == "" {
		return ""
	}
	u, err := url.Parse(ref)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return ""
	}
	h := strings.ToLower(u.Hostname())
	if len(h) > 253 {
		return ""
	}
	return h
}

// NormalizeCountry accepts a 2-letter ISO country code from a trusted header.
func NormalizeCountry(v string) string {
	v = strings.ToUpper(strings.TrimSpace(v))
	if len(v) != 2 || v == "XX" || v == "T1" {
		return ""
	}
	for _, r := range v {
		if r < 'A' || r > 'Z' {
			return ""
		}
	}
	return v
}
