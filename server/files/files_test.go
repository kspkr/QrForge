package files

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var pdf = []byte("%PDF-1.4\n%%EOF\n")

func TestCleanName(t *testing.T) {
	cases := map[string]string{
		"menu.pdf":                        "menu.pdf",
		"../../etc/passwd.txt":            "passwd.txt",
		`C:\Users\me\report.docx`:         "report.docx",
		"bad\x00na\u202eme.pdf":           "badname.pdf",
		`quote".pdf`:                      "quote.pdf",
		"  spaced.png  ":                  "spaced.png",
		"..":                              "",
		strings.Repeat("a", 300) + ".pdf": strings.Repeat("a", 196) + ".pdf",
	}
	for in, want := range cases {
		if got := CleanName(in); got != want {
			t.Errorf("CleanName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSaveOpenRemove(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	saved, err := s.Save(bytes.NewReader(pdf), "menu.PDF")
	if err != nil {
		t.Fatal(err)
	}
	if saved.ContentType != "application/pdf" || saved.Size != int64(len(pdf)) || !validKey(saved.Key) {
		t.Fatalf("unexpected result: %+v", saved)
	}
	f, err := s.Open(saved.Key)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(f)
	f.Close()
	if !bytes.Equal(got, pdf) {
		t.Fatal("stored contents differ")
	}
	if err := s.Remove(saved.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Open(saved.Key); err == nil {
		t.Fatal("file should be gone")
	}
}

func TestSaveRejects(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, 64)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	var typeErr *TypeError
	if _, err := s.Save(strings.NewReader("<html></html>"), "x.html"); !errors.As(err, &typeErr) {
		t.Fatalf("html: %v", err)
	}
	if _, err := s.Save(strings.NewReader("<html></html>"), "x.pdf"); !errors.As(err, &typeErr) {
		t.Fatalf("mismatched content: %v", err)
	}
	big := append(append([]byte{}, pdf...), bytes.Repeat([]byte("x"), 100)...)
	if _, err := s.Save(bytes.NewReader(big), "big.pdf"); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("oversized: %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("rejected uploads must not leave files behind: %v", entries)
	}
}

func TestOpenRejectsForeignKeys(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(filepath.Dir(dir), "secret.txt"), []byte("secret"), 0o600)
	s, err := Open(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, key := range []string{"../secret.txt", "secret.txt", "", strings.Repeat("A", 32)} {
		if _, err := s.Open(key); err == nil {
			t.Errorf("Open(%q) should fail", key)
		}
	}
}

func TestSweep(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	keep, _ := s.Save(bytes.NewReader(pdf), "keep.pdf")
	orphan, _ := s.Save(bytes.NewReader(pdf), "orphan.pdf")
	os.WriteFile(filepath.Join(dir, "README"), []byte("not ours"), 0o600)
	old := time.Now().Add(-2 * time.Hour)
	for _, name := range []string{keep.Key, orphan.Key, "README"} {
		os.Chtimes(filepath.Join(dir, name), old, old)
	}

	n, err := s.Sweep(map[string]bool{keep.Key: true}, time.Hour)
	if err != nil || n != 1 {
		t.Fatalf("Sweep removed %d (%v), want 1", n, err)
	}
	for name, want := range map[string]bool{keep.Key: true, orphan.Key: false, "README": true} {
		_, err := os.Stat(filepath.Join(dir, name))
		if (err == nil) != want {
			t.Errorf("%s exists=%v, want %v", name, err == nil, want)
		}
	}
}
