package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"nettop.local/backend/internal/dotenv"
	"nettop.local/backend/internal/httpapi"
	"nettop.local/backend/internal/persistence"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if _, err := dotenv.Load(); err != nil {
		slog.Error("reading .env failed", "error", err)
		os.Exit(1)
	}
	env, err := environment(os.Getenv("APP_ENV"))
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	connect, cancel := context.WithTimeout(ctx, 10*time.Second)
	store, err := persistence.Open(connect, os.Getenv("DATABASE_URL"))
	cancel()
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()
	check, done := context.WithTimeout(ctx, 10*time.Second)
	_, err = store.Installed(check)
	done()
	if err != nil {
		slog.Error("database is not initialized; run `go run ./cmd/db migrate` and then `go run ./cmd/db init`", "error", err)
		os.Exit(1)
	}
	server := &http.Server{Addr: addr, Handler: httpapi.New(store, env), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			slog.Error("shutdown failed", "error", err)
		}
	}()
	slog.Info("Net-Top API", "address", addr, "storage", "postgresql", "environment", env)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
