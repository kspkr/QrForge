package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kspkr/QrForge/server/files"
	"github.com/kspkr/QrForge/server/storage"
)

// uploadOverhead is the allowance for multipart framing on top of the file itself.
const uploadOverhead = 64 << 10

type fileJSON struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	SHA256      string `json:"sha256"`
	CodeCount   int64  `json:"code_count"`
	CreatedAt   string `json:"created_at"`
}

func toFileJSON(f *storage.File) *fileJSON {
	if f == nil {
		return nil
	}
	return &fileJSON{
		ID: f.ID, Name: f.Name, ContentType: f.ContentType, Size: f.Size, SHA256: f.SHA256,
		CodeCount: f.CodeCount, CreatedAt: ts(f.CreatedAt),
	}
}

// EnableFiles turns on file uploads backed by store. Call before Handler.
func (s *Server) EnableFiles(store *files.Store) {
	s.Files = store
	s.redirect.Files = store
}

func (s *Server) isUpload(r *http.Request) bool {
	return s.Files != nil && r.Method == http.MethodPost && r.URL.Path == "/api/v1/files"
}

func (s *Server) fileQuotaError(r *http.Request, u *storage.User, extra int64) error {
	quota := s.Cfg.FileUploads.QuotaBytes
	if u.IsAdmin() || quota <= 0 {
		return nil
	}
	used, err := s.DB.FileUsageBytes(r.Context(), u.ID)
	if err != nil {
		return err
	}
	if used+extra > quota {
		return errorf(http.StatusForbidden, "limit_reached",
			fmt.Sprintf("This upload would exceed your file storage limit of %s.", formatSize(quota)))
	}
	return nil
}

func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request, p *principal) error {
	if err := s.fileQuotaError(r, p.User, 1); err != nil {
		return err
	}
	// Large uploads on slow connections outlast the server-wide read timeout.
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(10 * time.Minute))

	mr, err := r.MultipartReader()
	if err != nil {
		return fieldError("file", "must be sent as multipart/form-data")
	}
	var saved *files.Saved
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return s.uploadError(err)
		}
		if part.FormName() != "file" || saved != nil {
			part.Close()
			continue
		}
		saved, err = s.Files.Save(part, part.FileName())
		part.Close()
		if err != nil {
			return s.uploadError(err)
		}
	}
	if saved == nil {
		return fieldError("file", "is required")
	}

	f := &storage.File{
		UserID: p.User.ID, Name: saved.Name, ContentType: saved.ContentType,
		Size: saved.Size, SHA256: saved.SHA256, StorageKey: saved.Key,
	}
	// The quota check and insert run under a lock so parallel uploads can't
	// each pass the check and overshoot the quota together.
	s.uploadMu.Lock()
	err = s.fileQuotaError(r, p.User, saved.Size)
	if err == nil {
		err = s.DB.CreateFile(r.Context(), f)
	}
	s.uploadMu.Unlock()
	if err != nil {
		if rmErr := s.Files.Remove(saved.Key); rmErr != nil {
			s.Log.Warn("remove rejected upload", "err", rmErr)
		}
		return err
	}
	s.audit(r.Context(), p, "file.upload", "file", f.ID, map[string]any{"name": f.Name, "size": f.Size})
	writeJSON(w, http.StatusCreated, toFileJSON(f))
	return nil
}

func (s *Server) uploadError(err error) error {
	var typeErr *files.TypeError
	var maxErr *http.MaxBytesError
	switch {
	case errors.As(err, &typeErr):
		return fieldError("file", typeErr.Message)
	case errors.Is(err, files.ErrTooLarge), errors.As(err, &maxErr):
		return errorf(http.StatusRequestEntityTooLarge, "payload_too_large",
			"Files can be at most "+formatSize(s.Cfg.FileUploads.MaxBytes)+".")
	}
	return err
}

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request, p *principal) error {
	items, err := s.DB.ListFiles(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	used, err := s.DB.FileUsageBytes(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	out := make([]*fileJSON, 0, len(items))
	for _, f := range items {
		out = append(out, toFileJSON(f))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out, "used_bytes": used, "quota_bytes": s.Cfg.FileUploads.QuotaBytes})
	return nil
}

func (s *Server) getFile(w http.ResponseWriter, r *http.Request, p *principal) error {
	f, err := s.DB.GetFile(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, toFileJSON(f))
	return nil
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request, p *principal) error {
	f, err := s.DB.GetFile(r.Context(), r.PathValue("id"), p.User.ID)
	if err != nil {
		return err
	}
	if f.CodeCount > 0 {
		return errorf(http.StatusConflict, "file_in_use", "This file is still used by a QR code. Delete the code or give it a different file first.")
	}
	if err := s.removeFile(r.Context(), f); err != nil {
		return err
	}
	s.audit(r.Context(), p, "file.delete", "file", f.ID, map[string]any{"name": f.Name})
	noContent(w)
	return nil
}

func (s *Server) removeFile(ctx context.Context, f *storage.File) error {
	if err := s.DB.DeleteFile(ctx, f.ID); err != nil {
		return err
	}
	if err := s.Files.Remove(f.StorageKey); err != nil {
		// The maintenance sweep retries orphaned files later.
		s.Log.Warn("remove stored file", "file_id", f.ID, "err", err)
	}
	return nil
}

// releaseFile deletes a file once no code serves it any more.
func (s *Server) releaseFile(ctx context.Context, fileID *string) {
	if s.Files == nil || fileID == nil {
		return
	}
	f, err := s.DB.GetFile(ctx, *fileID, "")
	if err != nil || f.CodeCount > 0 {
		return
	}
	if err := s.removeFile(ctx, f); err != nil {
		s.Log.Warn("release unused file", "file_id", f.ID, "err", err)
	}
}

// cleanupFiles removes uploads that were never attached to a code and any
// stray files on disk without a database row.
func (s *Server) cleanupFiles(ctx context.Context) {
	unused, err := s.DB.UnusedFilesBefore(ctx, time.Now().Add(-24*time.Hour).Unix())
	if err != nil {
		s.Log.Error("list unused files failed", "err", err)
		return
	}
	for _, f := range unused {
		if err := s.removeFile(ctx, f); err != nil {
			s.Log.Error("delete unused file failed", "file_id", f.ID, "err", err)
		}
	}
	known, err := s.DB.FileStorageKeys(ctx)
	if err != nil {
		s.Log.Error("list stored files failed", "err", err)
		return
	}
	n, err := s.Files.Sweep(known, time.Hour)
	if err != nil {
		s.Log.Error("file sweep failed", "err", err)
	} else if n > 0 || len(unused) > 0 {
		s.Log.Info("file cleanup", "unused_files", len(unused), "orphaned_files", n)
	}
}

func formatSize(n int64) string {
	switch {
	case n >= 1<<30 && n%(1<<30) == 0:
		return fmt.Sprintf("%d GB", n>>30)
	case n >= 1<<20:
		return fmt.Sprintf("%.4g MB", float64(n)/(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%.4g KB", float64(n)/(1<<10))
	}
	return fmt.Sprintf("%d bytes", n)
}
