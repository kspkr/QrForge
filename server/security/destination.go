package security

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"path"
	"strings"
	"unicode"

	"golang.org/x/net/idna"
)

// DestinationPolicy controls which URLs dynamic QR codes may redirect to.
type DestinationPolicy struct {
	MaxLength    int
	BlockPrivate bool
	Allowlist    []string // if non-empty, host must match one entry (or be a subdomain)
	Blocklist    []string // host must not match any entry (or be a subdomain)
	SelfHosts    []string // our own hosts; redirecting back into /r/ is refused (loops/chaining)
}

// DestinationError explains why a destination was rejected.
type DestinationError struct {
	Code    string // "validation_failed" or "destination_blocked"
	Message string
}

func (e *DestinationError) Error() string { return e.Message }

func invalid(msg string) error { return &DestinationError{Code: "validation_failed", Message: msg} }
func blocked(msg string) error { return &DestinationError{Code: "destination_blocked", Message: msg} }

// IsDestinationError reports whether err is a *DestinationError.
func IsDestinationError(err error) (*DestinationError, bool) {
	var de *DestinationError
	ok := errors.As(err, &de)
	return de, ok
}

var cgnat = mustCIDR("100.64.0.0/10")

func mustCIDR(s string) *net.IPNet {
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return n
}

// IsPrivateIP reports whether ip is loopback, private, link-local, unspecified,
// multicast or carrier-grade NAT space.
func IsPrivateIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() || cgnat.Contains(ip)
}

// asciiHost converts a hostname to canonical ASCII (punycode) using the same
// UTS #46 mapping browsers apply, so full-width or Unicode spellings compare
// equal to the host a browser would actually visit.
func asciiHost(host string) (string, error) {
	host = strings.TrimSuffix(strings.TrimSpace(host), ".")
	if net.ParseIP(host) != nil {
		return strings.ToLower(host), nil
	}
	a, err := idna.Lookup.ToASCII(host)
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(strings.ToLower(a), "."), nil
}

// HostMatches reports whether host equals pattern or is a subdomain of it.
// Both sides are IDNA-normalised first.
func HostMatches(host, pattern string) bool {
	pattern = strings.TrimPrefix(strings.TrimSpace(pattern), "*.")
	p, err := asciiHost(pattern)
	if err != nil {
		p = strings.TrimSuffix(strings.ToLower(pattern), ".")
	}
	if p == "" {
		return false
	}
	h, err := asciiHost(host)
	if err != nil {
		h = strings.TrimSuffix(strings.ToLower(host), ".")
	}
	return h == p || strings.HasSuffix(h, "."+p)
}

func isNumericLabel(label string) bool {
	if label == "" {
		return false
	}
	l := strings.ToLower(label)
	if strings.HasPrefix(l, "0x") {
		return true
	}
	for _, r := range l {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// ValidateDestination checks a redirect target and returns it normalised.
func (p DestinationPolicy) ValidateDestination(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", invalid("destination is required")
	}
	max := p.MaxLength
	if max <= 0 {
		max = 2048
	}
	if len(raw) > max {
		return "", invalid(fmt.Sprintf("destination must be at most %d characters", max))
	}
	for _, r := range raw {
		if unicode.IsControl(r) || unicode.IsSpace(r) {
			return "", invalid("destination must not contain whitespace or control characters")
		}
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", invalid("destination is not a valid URL")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", invalid("destination must be an http:// or https:// URL")
	}
	u.Scheme = scheme
	if u.Opaque != "" || u.Host == "" {
		return "", invalid("destination must be an absolute URL with a host")
	}
	if u.User != nil {
		return "", invalid("destination must not contain credentials")
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "" {
		return "", invalid("destination must include a host")
	}
	if strings.ContainsAny(host, "\\%") {
		return "", invalid("destination host is invalid")
	}
	// Canonicalise Unicode and full-width hostnames to the ASCII form a browser
	// would use, so look-alike encodings cannot bypass the checks below.
	ascii, err := asciiHost(host)
	if err != nil || ascii == "" {
		return "", invalid("destination host is invalid")
	}
	if ascii != host {
		host = ascii
		if port := u.Port(); port != "" {
			u.Host = net.JoinHostPort(host, port)
		} else {
			u.Host = host
		}
	}
	if port := u.Port(); port != "" && (len(port) > 5 || port == "0") {
		return "", invalid("destination port is invalid")
	}

	if p.BlockPrivate {
		if ip := net.ParseIP(host); ip != nil {
			if IsPrivateIP(ip) {
				return "", blocked("destinations on private or local networks are not allowed")
			}
		} else {
			labels := strings.Split(host, ".")
			if len(labels) < 2 {
				return "", blocked("destination must use a public domain name")
			}
			if isNumericLabel(labels[len(labels)-1]) {
				return "", blocked("destination host looks like an encoded IP address")
			}
			for _, suffix := range []string{"localhost", "local", "internal", "localdomain", "home.arpa", "lan"} {
				if HostMatches(host, suffix) {
					return "", blocked("destinations on private or local networks are not allowed")
				}
			}
		}
	}

	for _, self := range p.SelfHosts {
		clean := path.Clean("/" + u.Path)
		if self != "" && strings.EqualFold(host, self) && (clean == "/r" || strings.HasPrefix(clean, "/r/")) {
			return "", invalid("a dynamic QR code cannot redirect to another QRForge redirect")
		}
	}
	for _, b := range p.Blocklist {
		if HostMatches(host, b) {
			return "", blocked("this destination domain is blocked by the administrator")
		}
	}
	if len(p.Allowlist) > 0 {
		ok := false
		for _, a := range p.Allowlist {
			if HostMatches(host, a) {
				ok = true
				break
			}
		}
		if !ok {
			return "", blocked("this destination domain is not on the administrator's allowlist")
		}
	}
	return u.String(), nil
}

// NormalizeHostname validates and lowercases a DNS hostname (for custom domains).
func NormalizeHostname(h string) (string, error) {
	h = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(h)), ".")
	if h == "" || len(h) > 253 {
		return "", errors.New("hostname is required and must be at most 253 characters")
	}
	if net.ParseIP(h) != nil {
		return "", errors.New("hostname must be a domain name, not an IP address")
	}
	labels := strings.Split(h, ".")
	if len(labels) < 2 {
		return "", errors.New("hostname must be a fully qualified domain name (e.g. qr.example.com)")
	}
	for _, l := range labels {
		if l == "" || len(l) > 63 || strings.HasPrefix(l, "-") || strings.HasSuffix(l, "-") {
			return "", errors.New("hostname is not a valid domain name")
		}
		for _, r := range l {
			if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
				return "", errors.New("hostname is not a valid domain name")
			}
		}
	}
	if isNumericLabel(labels[len(labels)-1]) {
		return "", errors.New("hostname is not a valid domain name")
	}
	return h, nil
}
