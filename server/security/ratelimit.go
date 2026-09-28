// Package security holds QRForge's request-level protections: rate limiting,
// client IP resolution, security headers, token helpers and destination URL
// validation (open-redirect / SSRF-style abuse prevention).
package security

import (
	"math"
	"net"
	"sync"
	"time"
)

// maxKeys bounds limiter memory. A flood of distinct keys (e.g. spoofed or
// rotating addresses) evicts idle state instead of growing without limit.
const maxKeys = 100_000

// IPKey returns the rate-limit key for a client address. IPv6 clients
// usually control a whole /64, so they are limited per /64 prefix;
// otherwise a single host could bypass limits by rotating addresses.
func IPKey(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.To4() != nil {
		return ip
	}
	return parsed.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter is an in-memory token-bucket rate limiter keyed by string
// (IP address, API key id, email...). It is safe for concurrent use.
type Limiter struct {
	mu          sync.Mutex
	rate        float64 // tokens per second
	burst       float64
	buckets     map[string]*bucket
	lastCleanup time.Time
	now         func() time.Time
}

// NewLimiter allows `events` per `per` on average with bursts up to `events`.
func NewLimiter(events int, per time.Duration) *Limiter {
	if events < 1 {
		events = 1
	}
	return &Limiter{
		rate:    float64(events) / per.Seconds(),
		burst:   float64(events),
		buckets: map[string]*bucket{},
		now:     time.Now,
	}
}

// SetClock overrides the time source (tests).
func (l *Limiter) SetClock(now func() time.Time) { l.now = now }

// Allow consumes one token for key. When the bucket is empty it returns
// false and how long to wait before the next token is available.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.cleanup(now)

	b, ok := l.buckets[key]
	if !ok {
		if len(l.buckets) >= maxKeys {
			l.evict(now)
		}
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	return false, wait
}

// cleanup drops buckets that have fully refilled; they carry no state.
func (l *Limiter) cleanup(now time.Time) {
	if now.Sub(l.lastCleanup) < time.Minute {
		return
	}
	l.lastCleanup = now
	for k, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*l.rate >= l.burst {
			delete(l.buckets, k)
		}
	}
}

// evict makes room when the table is full: refilled buckets go first, then
// an arbitrary tenth of the remainder.
func (l *Limiter) evict(now time.Time) {
	l.lastCleanup = time.Time{}
	l.cleanup(now)
	if len(l.buckets) < maxKeys {
		return
	}
	drop := len(l.buckets) / 10
	for k := range l.buckets {
		if drop == 0 {
			break
		}
		delete(l.buckets, k)
		drop--
	}
}

// Len returns the number of tracked keys (tests/metrics).
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
