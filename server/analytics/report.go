package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/kspkr/QrForge/server/storage"
)

// Scope limits which scans a report covers.
type Scope struct {
	cond string
	args []any
}

// ForQRCode covers a single code.
func ForQRCode(id string) Scope { return Scope{"s.qrcode_id = ?", []any{id}} }

// ForCampaign covers all codes in a campaign.
func ForCampaign(id string) Scope { return Scope{"q.campaign_id = ?", []any{id}} }

// ForUser covers every code owned by a user.
func ForUser(userID string) Scope { return Scope{"q.user_id = ?", []any{userID}} }

// All covers every scan on the instance (admin).
func All() Scope { return Scope{"1 = 1", nil} }

// Ranges are the accepted `range` query values.
var Ranges = map[string]int{"24h": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365, "all": 0}

// Totals are headline numbers. Totals are computed over retained scans.
type Totals struct {
	TotalScans  int64 `json:"total_scans"`
	UniqueScans int64 `json:"unique_scans"`
	Today       int64 `json:"today"`
	ThisWeek    int64 `json:"this_week"`
	ThisMonth   int64 `json:"this_month"`
}

// RangeInfo describes the reporting window.
type RangeInfo struct {
	Key         string `json:"key"`
	From        string `json:"from"`
	To          string `json:"to"`
	Granularity string `json:"granularity"`
}

// Point is one timeseries bucket.
type Point struct {
	Bucket string `json:"bucket"`
	Scans  int64  `json:"scans"`
	Unique int64  `json:"unique"`
}

// Item is one row of a breakdown.
type Item struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// RangeTotals are totals within the window.
type RangeTotals struct {
	Scans  int64 `json:"scans"`
	Unique int64 `json:"unique"`
}

// Report is the analytics payload returned by the API.
type Report struct {
	Totals      Totals      `json:"totals"`
	Range       RangeInfo   `json:"range"`
	Timeseries  []Point     `json:"timeseries"`
	RangeTotals RangeTotals `json:"range_totals"`
	Browsers    []Item      `json:"browsers"`
	OS          []Item      `json:"os"`
	Devices     []Item      `json:"devices"`
	Countries   []Item      `json:"countries"`
	Referrers   []Item      `json:"referrers"`
}

const scanFrom = " FROM scans s JOIN qrcodes q ON q.id = s.qrcode_id WHERE "

// Window resolves a range key into [from, now] with bucket size.
func Window(ctx context.Context, db *storage.DB, scope Scope, key string, now time.Time) (from int64, bucket int64, err error) {
	days, ok := Ranges[key]
	if !ok {
		return 0, 0, fmt.Errorf("invalid range %q", key)
	}
	unix := now.Unix()
	today := unix / 86400 * 86400
	switch {
	case key == "24h":
		return unix/3600*3600 - 23*3600, 3600, nil
	case days > 0:
		return today - int64(days-1)*86400, 86400, nil
	default:
		var first *int64
		row := db.QueryRow(ctx, "SELECT MIN(s.scanned_at)"+scanFrom+scope.cond, scope.args...)
		var v any
		if err := row.Scan(&v); err != nil {
			return 0, 0, err
		}
		if n, ok := toInt64(v); ok {
			first = &n
		}
		if first == nil {
			return today, 86400, nil
		}
		return *first / 86400 * 86400, 86400, nil
	}
}

func toInt64(v any) (int64, bool) {
	switch x := v.(type) {
	case int64:
		return x, true
	case int32:
		return int64(x), true
	case int:
		return int64(x), true
	case float64:
		return int64(x), true
	case []byte:
		var n int64
		_, err := fmt.Sscan(string(x), &n)
		return n, err == nil
	case string:
		var n int64
		_, err := fmt.Sscan(x, &n)
		return n, err == nil
	}
	return 0, false
}

// Build computes a full analytics report for scope over the range key.
func Build(ctx context.Context, db *storage.DB, scope Scope, key string, now time.Time) (*Report, error) {
	if key == "" {
		key = "30d"
	}
	from, bucket, err := Window(ctx, db, scope, key, now)
	if err != nil {
		return nil, err
	}
	utc := now.UTC()
	today := utc.Unix() / 86400 * 86400
	weekStart := today - int64((int(utc.Weekday())+6)%7)*86400
	monthStart := time.Date(utc.Year(), utc.Month(), 1, 0, 0, 0, 0, time.UTC).Unix()

	r := &Report{}
	args := append([]any{today, weekStart, monthStart}, scope.args...)
	err = db.QueryRow(ctx, `SELECT COUNT(*), COUNT(DISTINCT s.visitor_hash),
		COUNT(CASE WHEN s.scanned_at >= ? THEN 1 END),
		COUNT(CASE WHEN s.scanned_at >= ? THEN 1 END),
		COUNT(CASE WHEN s.scanned_at >= ? THEN 1 END)`+scanFrom+scope.cond, args...).
		Scan(&r.Totals.TotalScans, &r.Totals.UniqueScans, &r.Totals.Today, &r.Totals.ThisWeek, &r.Totals.ThisMonth)
	if err != nil {
		return nil, err
	}

	inRange := scope.cond + " AND s.scanned_at >= ?"
	rangeArgs := append(append([]any{}, scope.args...), from)
	if err := db.QueryRow(ctx, "SELECT COUNT(*), COUNT(DISTINCT s.visitor_hash)"+scanFrom+inRange, rangeArgs...).
		Scan(&r.RangeTotals.Scans, &r.RangeTotals.Unique); err != nil {
		return nil, err
	}

	r.Timeseries, err = Timeseries(ctx, db, scope, from, bucket, now)
	if err != nil {
		return nil, err
	}

	granularity := "day"
	if bucket == 3600 {
		granularity = "hour"
	}
	r.Range = RangeInfo{
		Key:         key,
		From:        time.Unix(from, 0).UTC().Format(time.RFC3339),
		To:          utc.Format(time.RFC3339),
		Granularity: granularity,
	}

	breakdowns := []struct {
		col   string
		empty string
		dst   *[]Item
	}{
		{"s.browser", "Unknown", &r.Browsers},
		{"s.os", "Unknown", &r.OS},
		{"s.device", "Unknown", &r.Devices},
		{"s.country", "Unknown", &r.Countries},
		{"s.referrer_host", "Direct", &r.Referrers},
	}
	for _, b := range breakdowns {
		items, err := topValues(ctx, db, b.col, inRange, rangeArgs, b.empty)
		if err != nil {
			return nil, err
		}
		*b.dst = items
	}
	return r, nil
}

func topValues(ctx context.Context, db *storage.DB, col, cond string, args []any, empty string) ([]Item, error) {
	rows, err := db.Query(ctx, "SELECT "+col+", COUNT(*) AS n"+scanFrom+cond+" GROUP BY "+col+" ORDER BY n DESC, "+col+" LIMIT 10", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.Name, &it.Count); err != nil {
			return nil, err
		}
		if it.Name == "" {
			it.Name = empty
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// Timeseries returns zero-filled buckets from `from` up to now.
func Timeseries(ctx context.Context, db *storage.DB, scope Scope, from, bucket int64, now time.Time) ([]Point, error) {
	args := append([]any{bucket, bucket}, scope.args...)
	args = append(args, from)
	rows, err := db.Query(ctx, "SELECT (s.scanned_at / ?) * ? AS b, COUNT(*), COUNT(DISTINCT s.visitor_hash)"+scanFrom+
		scope.cond+" AND s.scanned_at >= ? GROUP BY 1", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type counts struct{ scans, unique int64 }
	byBucket := map[int64]counts{}
	for rows.Next() {
		var b, n, u int64
		if err := rows.Scan(&b, &n, &u); err != nil {
			return nil, err
		}
		byBucket[b] = counts{n, u}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	last := now.Unix() / bucket * bucket
	out := make([]Point, 0, (last-from)/bucket+1)
	for t := from; t <= last; t += bucket {
		label := time.Unix(t, 0).UTC().Format("2006-01-02")
		if bucket == 3600 {
			label = time.Unix(t, 0).UTC().Format(time.RFC3339)
		}
		c := byBucket[t]
		out = append(out, Point{Bucket: label, Scans: c.scans, Unique: c.unique})
	}
	return out, nil
}

// TopQRCodes returns the most-scanned codes of a user within the window.
func TopQRCodes(ctx context.Context, db *storage.DB, userID string, from int64, limit int) ([]storage.NamedCount, error) {
	rows, err := db.Query(ctx, `SELECT q.id, q.name, COUNT(*) AS n FROM scans s JOIN qrcodes q ON q.id = s.qrcode_id
		WHERE q.user_id = ? AND s.scanned_at >= ? GROUP BY q.id, q.name ORDER BY n DESC, q.name LIMIT ?`, userID, from, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []storage.NamedCount{}
	for rows.Next() {
		var c storage.NamedCount
		if err := rows.Scan(&c.ID, &c.Name, &c.Count); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
