package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/migrations"
	"github.com/kspkr/QrForge/server/settings"
	"github.com/kspkr/QrForge/server/storage"
)

type testEnv struct {
	t   *testing.T
	srv *httptest.Server
	api *Server
	db  *storage.DB
}

// newEnv starts a server backed by a fresh SQLite file (or Postgres when
// QRFORGE_TEST_POSTGRES_URL is set).
func newEnv(t *testing.T, mutate ...func(*config.Config)) *testEnv {
	t.Helper()
	cfg := config.Default()
	cfg.BcryptCost = 4
	cfg.RateLimits.AuthPerIP = 1000
	cfg.RateLimits.LoginPerEmail = 1000
	dbURL := "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "test.db"))
	if pg := os.Getenv("QRFORGE_TEST_POSTGRES_URL"); pg != "" {
		dbURL = pg
	}
	cfg.DatabaseURL = dbURL
	for _, m := range mutate {
		m(cfg)
	}
	db, err := storage.Open(cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if db.Dialect == storage.Postgres {
		resetPostgres(t, db)
	}
	if _, err := migrations.Run(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	st, err := settings.Load(context.Background(), db, settings.Defaults(cfg.RegistrationOpen))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	s := New(cfg, db, st, log, []byte("openapi: 3.1.0\n"))
	srv := httptest.NewServer(s.Handler())
	u, _ := url.Parse(srv.URL)
	cfg.BaseURL = u
	t.Cleanup(func() {
		srv.Close()
		db.Close()
	})
	return &testEnv{t: t, srv: srv, api: s, db: db}
}

func resetPostgres(t *testing.T, db *storage.DB) {
	t.Helper()
	for _, tbl := range []string{"scans", "qrcode_history", "abuse_reports", "qrcodes", "campaigns", "domains", "api_keys",
		"password_resets", "sessions", "audit_logs", "salts", "settings", "users", "schema_migrations"} {
		if _, err := db.Exec(context.Background(), "DROP TABLE IF EXISTS "+tbl+" CASCADE"); err != nil {
			t.Fatal(err)
		}
	}
}

type client struct {
	env    *testEnv
	http   *http.Client
	csrf   string
	apiKey string
	header http.Header
}

func (e *testEnv) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{
		env: e,
		http: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}},
		header: http.Header{},
	}
}

type response struct {
	Status int
	Header http.Header
	Body   []byte
	JSON   map[string]any
}

func (r *response) str(path ...string) string {
	v := r.get(path...)
	s, _ := v.(string)
	return s
}

func (r *response) num(path ...string) float64 {
	v := r.get(path...)
	n, _ := v.(float64)
	return n
}

func (r *response) get(path ...string) any {
	var cur any = r.JSON
	for _, p := range path {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = m[p]
	}
	return cur
}

func (r *response) list(path ...string) []any {
	v, _ := r.get(path...).([]any)
	return v
}

func (c *client) do(method, path string, body any) *response {
	c.env.t.Helper()
	var rdr io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rdr = strings.NewReader(b)
	case []byte:
		rdr = bytes.NewReader(b)
	default:
		buf, _ := json.Marshal(b)
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, c.env.srv.URL+path, rdr)
	if err != nil {
		c.env.t.Fatal(err)
	}
	if rdr != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.csrf != "" {
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	for k, v := range c.header {
		req.Header[k] = v
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.env.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	out := &response{Status: res.StatusCode, Header: res.Header, Body: data}
	_ = json.Unmarshal(data, &out.JSON)
	return out
}

func (c *client) mustStatus(r *response, status int) *response {
	c.env.t.Helper()
	if r.Status != status {
		c.env.t.Fatalf("expected status %d, got %d: %s", status, r.Status, r.Body)
	}
	return r
}

// register creates an account and keeps the session + CSRF token.
func (c *client) register(email string) *response {
	c.env.t.Helper()
	r := c.mustStatus(c.do("POST", "/api/v1/auth/register", map[string]string{
		"email": email, "password": "correct horse battery", "name": "Test",
	}), http.StatusCreated)
	c.csrf = r.str("csrf_token")
	return r
}

func (c *client) createDynamic(dest string, extra map[string]any) *response {
	c.env.t.Helper()
	body := map[string]any{"name": "Test code", "destination": dest}
	for k, v := range extra {
		body[k] = v
	}
	return c.mustStatus(c.do("POST", "/api/v1/qrcodes", body), http.StatusCreated)
}

// scan hits a redirect path as a phone would.
func (c *client) scan(path, ua string) *response {
	c.env.t.Helper()
	req, _ := http.NewRequest("GET", c.env.srv.URL+path, nil)
	req.Header.Set("User-Agent", ua)
	for k, v := range c.header {
		req.Header[k] = v
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.env.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return &response{Status: res.StatusCode, Header: res.Header, Body: data}
}

const (
	iphoneUA  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
	androidUA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
	botUA     = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
)
