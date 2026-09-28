// Package migrations applies the embedded, versioned SQL schema.
//
// Migration files are named NNNN_description.sql and applied in order,
// each inside a transaction. Applied versions are tracked in the
// schema_migrations table. The SQL is portable between SQLite and PostgreSQL.
package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"github.com/kspkr/QrForge/server/storage"
)

//go:embed *.sql
var files embed.FS

// Migration is a single schema version.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// All returns the embedded migrations sorted by version.
func All() ([]Migration, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, err
	}
	var out []Migration
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			return nil, fmt.Errorf("migration %q must be named NNNN_description.sql", name)
		}
		v, err := strconv.Atoi(prefix)
		if err != nil {
			return nil, fmt.Errorf("migration %q has an invalid version: %w", name, err)
		}
		body, err := files.ReadFile(name)
		if err != nil {
			return nil, err
		}
		out = append(out, Migration{Version: v, Name: name, SQL: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

// statements splits a migration into individual statements, dropping comments.
func statements(sqlText string) []string {
	var lines []string
	for _, line := range strings.Split(sqlText, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		lines = append(lines, line)
	}
	var out []string
	for _, stmt := range strings.Split(strings.Join(lines, "\n"), ";") {
		if s := strings.TrimSpace(stmt); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// Run applies all pending migrations and returns the number applied.
func Run(ctx context.Context, db *storage.DB) (int, error) {
	if _, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at BIGINT NOT NULL
	)`); err != nil {
		return 0, fmt.Errorf("create schema_migrations: %w", err)
	}

	applied := map[int]bool{}
	rows, err := db.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return 0, err
		}
		applied[v] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	all, err := All()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, m := range all {
		if applied[m.Version] {
			continue
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return count, err
		}
		for _, stmt := range statements(m.SQL) {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				tx.Rollback()
				return count, fmt.Errorf("migration %s: %w", m.Name, err)
			}
		}
		if _, err := tx.ExecContext(ctx,
			storage.Rebind(db.Dialect, "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"),
			m.Version, m.Name, storage.Now()); err != nil {
			tx.Rollback()
			return count, err
		}
		if err := tx.Commit(); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
