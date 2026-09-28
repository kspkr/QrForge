package storage_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kspkr/QrForge/server/migrations"
	"github.com/kspkr/QrForge/server/storage"
)

func TestRebind(t *testing.T) {
	q := "SELECT * FROM t WHERE a = ? AND b = '?' AND c IN (?, ?)"
	if got := storage.Rebind(storage.SQLite, q); got != q {
		t.Fatalf("sqlite must be untouched: %s", got)
	}
	want := "SELECT * FROM t WHERE a = $1 AND b = '?' AND c IN ($2, $3)"
	if got := storage.Rebind(storage.Postgres, q); got != want {
		t.Fatalf("got %s", got)
	}
}

func TestLikePattern(t *testing.T) {
	if got := storage.LikePattern(`50%_Off\`); got != `%50\%\_off\\%` {
		t.Fatalf("got %s", got)
	}
}

func TestSortableIDs(t *testing.T) {
	prev := ""
	for i := 0; i < 1000; i++ {
		id := storage.NewSortableID("x")
		if id <= prev {
			t.Fatalf("ids must be strictly increasing: %s <= %s", id, prev)
		}
		prev = id
	}
}

func openTestDB(t *testing.T) *storage.DB {
	t.Helper()
	url := "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "s.db"))
	if pg := os.Getenv("QRFORGE_TEST_POSTGRES_URL"); pg != "" {
		url = pg
	}
	db, err := storage.Open(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if db.Dialect == storage.Postgres {
		for _, tbl := range []string{"scans", "qrcode_history", "abuse_reports", "qrcodes", "campaigns", "domains", "api_keys",
			"password_resets", "sessions", "audit_logs", "salts", "settings", "users", "schema_migrations"} {
			db.Exec(context.Background(), "DROP TABLE IF EXISTS "+tbl+" CASCADE")
		}
	}
	return db
}

func TestMigrationsAreIdempotent(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	n, err := migrations.Run(ctx, db)
	if err != nil || n == 0 {
		t.Fatalf("first run: n=%d err=%v", n, err)
	}
	n, err = migrations.Run(ctx, db)
	if err != nil || n != 0 {
		t.Fatalf("second run should apply nothing: n=%d err=%v", n, err)
	}
}

func TestUsersAndQRCodes(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	if _, err := migrations.Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	u := &storage.User{Email: " Ada@Example.com ", PasswordHash: "x"}
	if err := db.CreateUser(ctx, u); err != nil {
		t.Fatal(err)
	}
	if err := db.CreateUser(ctx, &storage.User{Email: "ada@example.com", PasswordHash: "y"}); !errors.Is(err, storage.ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	got, err := db.GetUserByEmail(ctx, "ADA@example.com")
	if err != nil || got.ID != u.ID || got.Disabled {
		t.Fatalf("lookup: %+v %v", got, err)
	}

	slug := "abc1234"
	dest := "https://example.com"
	q := &storage.QRCode{UserID: u.ID, Name: "A", Kind: "dynamic", QRType: "url", Slug: &slug, Destination: &dest, AnalyticsEnabled: true}
	if err := db.CreateQRCode(ctx, q); err != nil {
		t.Fatal(err)
	}
	dup := *q
	dup.ID = ""
	if err := db.CreateQRCode(ctx, &dup); !errors.Is(err, storage.ErrConflict) {
		t.Fatalf("duplicate slug must conflict, got %v", err)
	}
	byslug, err := db.GetQRCodeBySlug(ctx, slug)
	if err != nil || byslug.ID != q.ID || !byslug.AnalyticsEnabled || byslug.OwnerEmail != "ada@example.com" {
		t.Fatalf("by slug: %+v %v", byslug, err)
	}
	if _, err := db.GetQRCode(ctx, q.ID, "someone-else"); !errors.Is(err, storage.ErrNotFound) {
		t.Fatal("ownership scoping")
	}
	if err := db.InsertScan(ctx, &storage.Scan{QRCodeID: q.ID, ScannedAt: 100, VisitorHash: "h"}); err != nil {
		t.Fatal(err)
	}
	items, total, err := db.ListQRCodes(ctx, storage.QRFilter{UserID: u.ID, Query: "EXAMPLE", Limit: 10})
	if err != nil || total != 1 || items[0].ScanCount != 1 {
		t.Fatalf("list: %d %v", total, err)
	}
	if err := db.DeleteQRCode(ctx, q.ID, u.ID); err != nil {
		t.Fatal(err)
	}
	if n, _ := db.Count(ctx, "SELECT COUNT(*) FROM scans"); n != 0 {
		t.Fatal("scans must cascade on delete")
	}
	if !strings.HasPrefix(q.ID, "qr_") {
		t.Fatalf("id prefix: %s", q.ID)
	}
}
