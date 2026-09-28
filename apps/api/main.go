// Command api runs the QRForge server: REST API, dynamic QR redirects and
// (optionally) the built web UI.
//
//	cd apps/api && go run .
//
// Configuration is read from QRFORGE_* environment variables; with no
// configuration it uses SQLite at ./data/qrforge.db and listens on :8080.
package main

import (
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kspkr/QrForge/server/api"
	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/migrations"
	"github.com/kspkr/QrForge/server/settings"
	"github.com/kspkr/QrForge/server/storage"
)

//go:embed openapi.yaml
var openapiSpec []byte

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "qrforge:", err)
		os.Exit(1)
	}
}

func run() error {
	showVersion := flag.Bool("version", false, "print the version and exit")
	migrateOnly := flag.Bool("migrate", false, "apply database migrations and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("qrforge", config.Version)
		return nil
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := newLogger(cfg.LogFormat)
	slog.SetDefault(log)

	db, err := storage.Open(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	applied, err := migrations.Run(ctx, db)
	if err != nil {
		return fmt.Errorf("migrations: %w", err)
	}
	log.Info("database ready", "driver", db.Dialect, "migrations_applied", applied)
	if *migrateOnly {
		return nil
	}

	st, err := settings.Load(ctx, db, settings.Defaults(cfg.RegistrationOpen))
	if err != nil {
		return fmt.Errorf("load settings: %w", err)
	}
	srv := api.New(cfg, db, st, log, openapiSpec)
	if err := srv.Bootstrap(ctx); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	srv.StartBackgroundJobs(ctx)

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("QRForge listening", "addr", cfg.Addr, "base_url", cfg.BaseURLString(), "web_dir", cfg.WebDir)
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return err
		}
	}
	return nil
}

func newLogger(format string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if format == "json" {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}
