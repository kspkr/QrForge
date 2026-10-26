package api

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"github.com/kspkr/QrForge/server/config"
)

var samplePDF = []byte("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")

func withFiles(c *config.Config) { c.FileUploads.Enabled = true }

func (c *client) upload(name string, content []byte) *response {
	c.env.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", name)
	if err != nil {
		c.env.t.Fatal(err)
	}
	part.Write(content)
	mw.Close()

	req, _ := http.NewRequest("POST", c.env.srv.URL+"/api/v1/files", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if c.csrf != "" {
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
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

func TestFileUploadsOffByDefault(t *testing.T) {
	env := newEnv(t)
	c := env.client()
	c.register("off@example.com")

	cfg := c.mustStatus(c.do("GET", "/api/v1/config", nil), 200)
	if cfg.get("features", "file_uploads") != false || cfg.get("file_uploads") != nil {
		t.Fatalf("config must report uploads as disabled: %s", cfg.Body)
	}
	if res := c.upload("menu.pdf", samplePDF); res.Status != http.StatusNotFound {
		t.Fatalf("upload endpoint must not exist when disabled, got %d", res.Status)
	}
	res := c.do("POST", "/api/v1/qrcodes", map[string]any{"name": "x", "file_id": "file_abc"})
	if res.Status != http.StatusUnprocessableEntity || res.str("error", "fields", "file_id") == "" {
		t.Fatalf("file_id must be rejected when disabled: %d %s", res.Status, res.Body)
	}
}

func TestFileCodeServesAttachment(t *testing.T) {
	env := newEnv(t, withFiles)
	c := env.client()
	c.register("files@example.com")

	cfg := c.mustStatus(c.do("GET", "/api/v1/config", nil), 200)
	if cfg.get("features", "file_uploads") != true || cfg.num("file_uploads", "max_bytes") != 10<<20 {
		t.Fatalf("config must advertise uploads: %s", cfg.Body)
	}

	file := c.mustStatus(c.upload("Lunch menü.pdf", samplePDF), http.StatusCreated)
	if file.str("content_type") != "application/pdf" || file.num("size") != float64(len(samplePDF)) {
		t.Fatalf("unexpected upload response: %s", file.Body)
	}
	code := c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"file_id": file.str("id")}), http.StatusCreated)
	if code.str("qr_type") != "file" || code.get("destination") != nil || code.str("name") != "Lunch menü.pdf" {
		t.Fatalf("unexpected code: %s", code.Body)
	}
	if code.str("file", "id") != file.str("id") {
		t.Fatalf("code must include file metadata: %s", code.Body)
	}

	res := c.scan("/r/"+code.str("slug"), iphoneUA)
	if res.Status != http.StatusOK || !bytes.Equal(res.Body, samplePDF) {
		t.Fatalf("expected file contents, got %d", res.Status)
	}
	if got := res.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") || !strings.Contains(got, "filename*=utf-8''Lunch%20men%C3%BC.pdf") {
		t.Fatalf("file must download as an attachment with its name: %q", got)
	}
	if res.Header.Get("Content-Type") != "application/pdf" || res.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("unexpected content headers: %v", res.Header)
	}
	if !strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") {
		t.Fatalf("downloads must be sandboxed: %q", res.Header.Get("Content-Security-Policy"))
	}

	// A resumed download is not a second scan.
	c.header.Set("Range", "bytes=10-")
	if res := c.scan("/r/"+code.str("slug"), iphoneUA); res.Status != http.StatusPartialContent {
		t.Fatalf("range request: %d", res.Status)
	}
	c.header.Del("Range")
	got := c.mustStatus(c.do("GET", "/api/v1/qrcodes/"+code.str("id"), nil), 200)
	if got.num("scan_count") != 1 {
		t.Fatalf("expected 1 scan, got %v", got.num("scan_count"))
	}

	// Passwords gate the download like a redirect.
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+code.str("id"), map[string]any{"password": "s3cret"}), 200)
	res = c.scan("/r/"+code.str("slug"), iphoneUA)
	if res.Status != http.StatusOK || !strings.Contains(string(res.Body), "Protected link") || bytes.Contains(res.Body, samplePDF) {
		t.Fatalf("password page expected before download")
	}
}

func TestUploadRejectsUnsafeFiles(t *testing.T) {
	env := newEnv(t, withFiles, func(c *config.Config) { c.FileUploads.MaxBytes = 4096 })
	c := env.client()
	c.register("unsafe@example.com")

	cases := map[string][]byte{
		"page.html":     []byte("<!doctype html><script>alert(1)</script>"),
		"image.svg":     []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"fake.pdf":      []byte("<html><script>alert(1)</script></html>"),
		"notes.txt":     []byte("<html><body>hi</body></html>"),
		"program.exe":   []byte("MZ\x90\x00"),
		"empty.pdf":     {},
		"no-extension":  samplePDF,
		"photo.png.php": samplePDF,
	}
	for name, content := range cases {
		if res := c.upload(name, content); res.Status != http.StatusUnprocessableEntity {
			t.Errorf("%s: expected 422, got %d: %s", name, res.Status, res.Body)
		}
	}

	big := append(append([]byte{}, samplePDF...), bytes.Repeat([]byte("x"), 5000)...)
	if res := c.upload("big.pdf", big); res.Status != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized upload: expected 413, got %d", res.Status)
	}

	res := c.mustStatus(c.upload(`..\..\etc/evil.pdf`, samplePDF), http.StatusCreated)
	if res.str("name") != "evil.pdf" {
		t.Fatalf("directory parts must be stripped from names, got %q", res.str("name"))
	}
	list := c.mustStatus(c.do("GET", "/api/v1/files", nil), 200)
	if len(list.list("data")) != 1 {
		t.Fatalf("rejected uploads must not be stored: %s", list.Body)
	}
}

func TestFileOwnershipAndQuota(t *testing.T) {
	env := newEnv(t, withFiles, func(c *config.Config) { c.FileUploads.QuotaBytes = int64(len(samplePDF)) + 10 })
	env.client().register("admin@example.com") // the first account is an admin, which has no quota
	alice := env.client()
	alice.register("alice@example.com")
	bob := env.client()
	bob.register("bob@example.com")

	file := alice.mustStatus(alice.upload("a.pdf", samplePDF), http.StatusCreated)
	if res := alice.upload("b.pdf", samplePDF); res.Status != http.StatusForbidden || res.str("error", "code") != "limit_reached" {
		t.Fatalf("quota must be enforced: %d %s", res.Status, res.Body)
	}
	res := bob.do("POST", "/api/v1/qrcodes", map[string]any{"file_id": file.str("id")})
	if res.Status != http.StatusUnprocessableEntity {
		t.Fatalf("another user's file must be rejected: %d", res.Status)
	}
	bob.mustStatus(bob.do("GET", "/api/v1/files/"+file.str("id"), nil), http.StatusNotFound)
	bob.mustStatus(bob.do("DELETE", "/api/v1/files/"+file.str("id"), nil), http.StatusNotFound)
}

func TestSwitchingBetweenFileAndLink(t *testing.T) {
	env := newEnv(t, withFiles)
	c := env.client()
	c.register("switch@example.com")

	code := c.createDynamic("https://example.com/menu", nil)
	id, path := code.str("id"), "/r/"+code.str("slug")
	file := c.mustStatus(c.upload("menu.pdf", samplePDF), http.StatusCreated)

	res := c.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{"file_id": file.str("id"), "destination": "https://example.com"})
	c.mustStatus(res, http.StatusUnprocessableEntity)

	updated := c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{"file_id": file.str("id")}), 200)
	if updated.str("qr_type") != "file" || updated.get("destination") != nil {
		t.Fatalf("code should now serve the file: %s", updated.Body)
	}
	if res := c.scan(path, iphoneUA); res.Status != http.StatusOK || !bytes.Equal(res.Body, samplePDF) {
		t.Fatalf("expected file download, got %d", res.Status)
	}
	c.mustStatus(c.do("DELETE", "/api/v1/files/"+file.str("id"), nil), http.StatusConflict)
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{"file_id": nil}), http.StatusUnprocessableEntity)

	// Pointing the code back at a link releases the file it no longer uses.
	c.mustStatus(c.do("PATCH", "/api/v1/qrcodes/"+id, map[string]any{"destination": "https://example.org/new"}), 200)
	if res := c.scan(path, iphoneUA); res.Header.Get("Location") != "https://example.org/new" {
		t.Fatalf("expected redirect, got %d %s", res.Status, res.Header.Get("Location"))
	}
	c.mustStatus(c.do("GET", "/api/v1/files/"+file.str("id"), nil), http.StatusNotFound)

	// Deleting a file code releases its file too.
	file = c.mustStatus(c.upload("menu.pdf", samplePDF), http.StatusCreated)
	other := c.mustStatus(c.do("POST", "/api/v1/qrcodes", map[string]any{"file_id": file.str("id")}), http.StatusCreated)
	c.mustStatus(c.do("DELETE", "/api/v1/qrcodes/"+other.str("id"), nil), http.StatusNoContent)
	c.mustStatus(c.do("GET", "/api/v1/files/"+file.str("id"), nil), http.StatusNotFound)
}
