package analytics

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"

	"github.com/kspkr/QrForge/server/security"
	"github.com/kspkr/QrForge/server/storage"
)

// Recorder writes anonymous scan events.
//
// Unique visitors are counted with a hash of (daily salt, IP, user agent,
// QR id). The salt is random, rotates every UTC day and old salts are
// deleted, so hashes cannot be reversed or linked across days, and the IP
// address itself is never stored.
type Recorder struct {
	db    *storage.DB
	mu    sync.Mutex
	day   int64
	salt  string
	nowFn func() time.Time
}

// NewRecorder creates a recorder backed by db.
func NewRecorder(db *storage.DB) *Recorder {
	return &Recorder{db: db, nowFn: time.Now}
}

func (r *Recorder) saltFor(ctx context.Context, day int64) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.day == day && r.salt != "" {
		return r.salt, nil
	}
	salt, err := r.db.GetOrCreateSalt(ctx, day, security.RandomToken(32))
	if err != nil {
		return "", err
	}
	r.day, r.salt = day, salt
	return salt, nil
}

// VisitorHash returns the anonymous visitor identifier for a scan.
func (r *Recorder) VisitorHash(ctx context.Context, at time.Time, ip, ua, qrID string) (string, error) {
	salt, err := r.saltFor(ctx, at.UTC().Unix()/86400)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	for _, part := range []string{salt, ip, ua, qrID} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:16], nil
}

// ScanInput is everything needed to record one scan.
type ScanInput struct {
	QRCodeID  string
	IP        string
	UserAgent string
	Referrer  string
	Country   string
}

// Record stores a scan. Bots should be filtered by the caller using IsBot.
func (r *Recorder) Record(ctx context.Context, in ScanInput) error {
	now := r.nowFn()
	hash, err := r.VisitorHash(ctx, now, in.IP, in.UserAgent, in.QRCodeID)
	if err != nil {
		return err
	}
	c := ParseUserAgent(in.UserAgent)
	return r.db.InsertScan(ctx, &storage.Scan{
		QRCodeID:     in.QRCodeID,
		ScannedAt:    now.Unix(),
		VisitorHash:  hash,
		Browser:      c.Browser,
		OS:           c.OS,
		Device:       c.Device,
		Country:      NormalizeCountry(in.Country),
		ReferrerHost: ReferrerHost(in.Referrer),
	})
}

// RotateSalts deletes salts older than yesterday (UTC).
func (r *Recorder) RotateSalts(ctx context.Context) error {
	today := r.nowFn().UTC().Unix() / 86400
	return r.db.DeleteSaltsBefore(ctx, today-1)
}
