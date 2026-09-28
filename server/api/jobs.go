package api

import (
	"context"
	"errors"
	"time"

	"github.com/kspkr/QrForge/server/storage"
)

// Bootstrap creates the initial administrator from configuration when the
// instance has no accounts yet.
func (s *Server) Bootstrap(ctx context.Context) error {
	if s.Cfg.AdminEmail == "" || s.Cfg.AdminPassword == "" {
		return nil
	}
	n, err := s.DB.CountUsers(ctx)
	if err != nil || n > 0 {
		return err
	}
	email := storage.NormalizeEmail(s.Cfg.AdminEmail)
	if !validEmail(email) {
		return errors.New("QRFORGE_ADMIN_EMAIL is not a valid email address")
	}
	hash, err := s.Auth.HashPassword(s.Cfg.AdminPassword)
	if err != nil {
		return err
	}
	u := &storage.User{Email: email, Name: "Administrator", PasswordHash: hash, Role: "admin"}
	if err := s.DB.CreateUser(ctx, u); err != nil {
		return err
	}
	s.Log.Info("created initial administrator", "email", email)
	return nil
}

// RunMaintenance performs periodic cleanup: analytics retention, expired
// sessions and reset tokens, and discarding old visitor-hash salts.
func (s *Server) RunMaintenance(ctx context.Context) {
	if days := s.Settings.Get().AnalyticsRetentionDays; days > 0 {
		cutoff := time.Now().Unix() - int64(days)*86400
		if n, err := s.DB.DeleteScansBefore(ctx, cutoff); err != nil {
			s.Log.Error("analytics retention cleanup failed", "err", err)
		} else if n > 0 {
			s.Log.Info("analytics retention cleanup", "deleted_scans", n, "retention_days", days)
		}
	}
	if err := s.DB.CleanupExpired(ctx); err != nil {
		s.Log.Error("session cleanup failed", "err", err)
	}
	if err := s.Recorder.RotateSalts(ctx); err != nil {
		s.Log.Error("salt rotation failed", "err", err)
	}
}

// StartBackgroundJobs runs maintenance now and then hourly until ctx is done.
func (s *Server) StartBackgroundJobs(ctx context.Context) {
	go func() {
		s.RunMaintenance(ctx)
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.RunMaintenance(ctx)
			}
		}
	}()
}
