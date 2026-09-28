// Package storage provides database access for QRForge.
//
// The same SQL runs on SQLite (local/simple installs) and PostgreSQL
// (production). Queries are written with `?` placeholders and rebound to
// `$n` for PostgreSQL. Timestamps are stored as unix seconds (BIGINT).
package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver ("pgx")
	_ "modernc.org/sqlite"             // pure-Go SQLite driver ("sqlite")
)

// Dialect identifies the SQL database in use.
type Dialect string

const (
	SQLite   Dialect = "sqlite"
	Postgres Dialect = "postgres"
)

// ErrNotFound is returned when a row does not exist (or is not visible to the caller).
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a unique constraint is violated.
var ErrConflict = errors.New("conflict")

// DB wraps *sql.DB with dialect-aware helpers.
type DB struct {
	*sql.DB
	Dialect Dialect
	path    string // SQLite file path, for storage stats
}

// Open connects to the database described by a URL:
//
//	sqlite://path/to/file.db   (relative or absolute path)
//	sqlite://:memory:
//	postgres://user:pass@host:5432/db?sslmode=disable
func Open(databaseURL string) (*DB, error) {
	switch {
	case strings.HasPrefix(databaseURL, "postgres://"), strings.HasPrefix(databaseURL, "postgresql://"):
		db, err := sql.Open("pgx", databaseURL)
		if err != nil {
			return nil, err
		}
		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(30 * time.Minute)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			db.Close()
			return nil, fmt.Errorf("connect to postgres: %w", err)
		}
		return &DB{DB: db, Dialect: Postgres}, nil
	case strings.HasPrefix(databaseURL, "sqlite://"), strings.HasPrefix(databaseURL, "sqlite:"):
		path := strings.TrimPrefix(strings.TrimPrefix(databaseURL, "sqlite://"), "sqlite:")
		if path == "" {
			return nil, errors.New("sqlite database path is empty")
		}
		if path != ":memory:" {
			if dir := filepath.Dir(path); dir != "." {
				if err := os.MkdirAll(dir, 0o750); err != nil {
					return nil, fmt.Errorf("create database directory: %w", err)
				}
			}
		}
		dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_txlock=immediate"
		db, err := sql.Open("sqlite", dsn)
		if err != nil {
			return nil, err
		}
		// SQLite allows a single writer; one connection avoids SQLITE_BUSY
		// entirely and is plenty fast for self-hosted workloads.
		db.SetMaxOpenConns(1)
		if err := db.Ping(); err != nil {
			db.Close()
			return nil, fmt.Errorf("open sqlite: %w", err)
		}
		return &DB{DB: db, Dialect: SQLite, path: path}, nil
	default:
		return nil, fmt.Errorf("unsupported database URL %q (use sqlite://path or postgres://...)", databaseURL)
	}
}

// Rebind converts `?` placeholders to `$1..$n` for PostgreSQL.
func Rebind(d Dialect, query string) string {
	if d != Postgres {
		return query
	}
	var b strings.Builder
	b.Grow(len(query) + 16)
	n := 0
	inString := false
	for i := 0; i < len(query); i++ {
		ch := query[i]
		if ch == '\'' {
			inString = !inString
		}
		if ch == '?' && !inString {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteByte(ch)
	}
	return b.String()
}

func (db *DB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return db.DB.ExecContext(ctx, Rebind(db.Dialect, query), args...)
}

func (db *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return db.DB.QueryContext(ctx, Rebind(db.Dialect, query), args...)
}

func (db *DB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return db.DB.QueryRowContext(ctx, Rebind(db.Dialect, query), args...)
}

// Count runs a COUNT query and returns the result.
func (db *DB) Count(ctx context.Context, query string, args ...any) (int64, error) {
	var n int64
	err := db.QueryRow(ctx, query, args...).Scan(&n)
	return n, err
}

// SizeBytes returns the approximate on-disk size of the database.
func (db *DB) SizeBytes(ctx context.Context) int64 {
	if db.Dialect == Postgres {
		var n int64
		if err := db.QueryRow(ctx, "SELECT pg_database_size(current_database())").Scan(&n); err == nil {
			return n
		}
		return 0
	}
	var total int64
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if st, err := os.Stat(db.path + suffix); err == nil {
			total += st.Size()
		}
	}
	return total
}

// isUniqueViolation detects unique-constraint errors across drivers.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") || // sqlite
		strings.Contains(msg, "SQLSTATE 23505") || // postgres
		strings.Contains(msg, "duplicate key value")
}

func mapErr(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if isUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

// nullInt64 converts a pointer to a nullable value for queries.
func nullInt64(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

func nullString(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func ptrInt64(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func ptrString(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	v := s.String
	return &v
}

// Now returns the current unix time in seconds. Overridable in tests.
var Now = func() int64 { return time.Now().Unix() }
