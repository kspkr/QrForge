# Architecture

QRForge consists of several independent components that share one QR engine, `@qrforge/core`.

```text
                     ┌──────────────────────────────────────────┐
                     │            @qrforge/core (JS)             │
                     │ encoder · payloads · layout · SVG/PNG/PDF │
                     └───────┬───────────────┬──────────┬───────┘
                             │               │          │
                 ┌───────────▼──┐   ┌────────▼─────┐  ┌─▼────────────┐
                 │@qrforge/react│   │ qrforge CLI  │  │ your app     │
                 └───────┬──────┘   └──────────────┘  └──────────────┘
                         │
                 ┌───────▼───────────────────────────┐
  Browser        │ apps/web  (React + Vite + Tailwind)│   Studio runs locally
                 │ Studio · Dashboard · Admin         │
                 └───────┬───────────────────────────┘
                         │ /api/v1 (JSON, session cookie + CSRF)
  ───────────────────────┼─────────────────────────────────────────────
  Server                 │                         scanners
                 ┌───────▼──────────────────────┐      │  GET /r/{slug}
                 │ apps/api  (Go, net/http)      │◄─────┘
                 │  server/api       REST        │
                 │  server/redirect  /r/{slug}   │──► 302 → destination
                 │  server/analytics scans       │
                 │  server/auth · security       │
                 │  server/web       SPA files   │
                 └───────┬──────────────────────┘
                         │ database/sql
                 ┌───────▼──────────┐
                 │ SQLite / Postgres │
                 └──────────────────┘
       @qrforge/sdk ── HTTP + API key ──► /api/v1
```

## Design decisions

- Static generation does not involve the server. The Studio renders codes with `@qrforge/core` in the browser, including PNG and PDF export.
- The server is optional. On load, the web app requests `/api/v1/config`. If the request fails, or the app was built with `VITE_STATIC_ONLY=true`, dashboard features are hidden.
- The server compiles to a single static binary without cgo. Its direct dependencies are `modernc.org/sqlite` (a pure-Go SQLite driver), `pgx` and `golang.org/x/crypto`.
- The same schema and queries run on SQLite and PostgreSQL. SQL uses `?` placeholders (rebound to `$n` for PostgreSQL), text IDs, Unix-second `BIGINT` timestamps and booleans. Analytics buckets are computed with integer arithmetic on timestamps and zero-filled in Go.

## Repository layout

```text
apps/
  web/        React single-page app (Studio, dashboard, admin)
  api/        Go entry point (main.go) and openapi.yaml
  docs/       This documentation (VitePress)
packages/
  core/       @qrforge/core: encoder, payload builders, renderers
  react/      @qrforge/react: components and hooks
  cli/        qrforge: command-line tool
  sdk/        @qrforge/sdk: REST API client
server/
  config/     environment configuration
  storage/    database access (SQLite and PostgreSQL)
  migrations/ embedded SQL migrations and runner
  auth/       passwords, sessions, API keys, password reset, SMTP
  security/   rate limiting, client IPs, headers, destination validation
  analytics/  user-agent parsing, bot detection, visitor hashing, reports
  redirect/   /r/{slug} handler, password form, status pages
  settings/   runtime settings edited by administrators
  api/        REST handlers and background jobs
  web/        static file serving for the web app
docker/       Dockerfile, Compose variants, Caddyfile
```

## `@qrforge/core` pipeline

```text
data ─► payload builder ─► encode()  ─► module matrix
                                          │
options ─► normalizeOptions() ─► createLayout(): shapes in module units
                                          │
                     ┌────────────────────┼─────────────────────┐
                  renderSVG()      rasterize() + encodePNG()   renderPDF()
                                   (canvas in browsers)
```

The layout step converts the matrix into rectangles with per-corner radii and circles, optionally with holes. Every renderer draws the same shapes, so SVG, PNG and PDF output match.

## How a scan is handled

1. `GET /r/{slug}` is rate-limited per client IP.
2. The code is looked up by slug (unique index). On a custom domain, only codes assigned to that domain match.
3. The server responds with 404 if the code does not exist, and 410 if it is disabled, expired, owned by a disabled account, or its destination now violates policy. Password-protected codes show a form first.
4. If analytics are enabled and the user agent is not a bot, one row is written to `scans`. A failed write does not block the redirect.
5. The server responds with `302` to the destination, with UTM parameters merged and `Cache-Control: no-store`.

## Database schema

| Table | Purpose |
| --- | --- |
| `users` | Accounts: email, bcrypt hash, role, disabled flag, per-user code limit. |
| `sessions` | Hashed session tokens, CSRF token, expiry. |
| `password_resets` | Hashed single-use reset tokens. |
| `api_keys` | Hashed keys, display prefix, usage counters. |
| `qrcodes` | Static and dynamic codes: content, destination, slug (unique), status, admin lock, expiry, password hash, UTM parameters, design JSON, campaign, domain. |
| `qrcode_history` | Destination changes. |
| `campaigns` | Groups of codes. |
| `domains` | Custom hostnames and their verification state. |
| `scans` | Anonymous scan records, indexed by `(qrcode_id, scanned_at)`. |
| `salts` | Daily random salts for visitor hashes, removed after two days. |
| `audit_logs` | Security-relevant events. |
| `abuse_reports` | Public reports and their resolution. |
| `settings` | Policies edited by administrators. |
| `schema_migrations` | Applied migrations, maintained by the migration runner. |

## Background jobs

Each server process runs an hourly job that deletes scans older than the retention period, expired sessions and reset tokens, and outdated visitor-hash salts.
