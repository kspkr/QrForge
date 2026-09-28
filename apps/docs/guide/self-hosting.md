# Self-hosting

The QRForge server is a single Go binary. It serves the REST API (`/api/v1`), the redirect service for dynamic codes (`/r/{slug}`) and, when `QRFORGE_WEB_DIR` is set, the web app. Its only external requirement is a database: SQLite (built in) or PostgreSQL. It does not use external authentication providers or cloud services.

[Docker](./docker) is the quickest way to run it. This page is the reference for every deployment method.

## Requirements

| Resource | Minimum |
| --- | --- |
| CPU and memory | 1 vCPU, 256 MB (more for heavy redirect traffic) |
| Database | SQLite for a single instance, or PostgreSQL 13+ for production and multiple instances |
| Network | A public hostname if codes are scanned outside your network |

## Configuration

All settings are environment variables, and all are optional.

| Variable | Default | Description |
| --- | --- | --- |
| `QRFORGE_ADDR` | `:8080` | Listen address. `PORT` is used when `QRFORGE_ADDR` is not set. |
| `QRFORGE_BASE_URL` | `http://localhost:8080` | Public URL, used for dynamic code links, reset emails and the `Origin` check. Must be an absolute `http` or `https` URL. |
| `QRFORGE_DATABASE_URL` | `sqlite://data/qrforge.db` | `sqlite://relative/path.db`, `sqlite:///absolute/path.db` or `postgres://user:pass@host:5432/db?sslmode=disable`. |
| `QRFORGE_WEB_DIR` | empty | Directory containing the built web app (`apps/web/dist`). Unknown paths fall back to `index.html`; hashed assets are cached for one year. |
| `QRFORGE_COOKIE_SECURE` | auto | `true` or `false`. By default, cookies are marked `Secure` when the base URL uses `https`, which also enables HSTS. |
| `QRFORGE_TRUSTED_PROXIES` | empty | Comma-separated CIDRs or IP addresses of reverse proxies allowed to set `X-Forwarded-For` and `X-Real-IP`. |
| `QRFORGE_COUNTRY_HEADER` | empty | Header containing a two-letter country code, used by [analytics](./analytics#countries). |
| `QRFORGE_REGISTRATION` | `open` | Initial registration mode, `open` or `closed`. Administrators can change it later. |
| `QRFORGE_ADMIN_EMAIL`, `QRFORGE_ADMIN_PASSWORD` | empty | Administrator created at startup when the database has no users. |
| `QRFORGE_SMTP_HOST` | empty | SMTP server for password reset email. |
| `QRFORGE_SMTP_PORT` | `587` | SMTP port. |
| `QRFORGE_SMTP_USERNAME`, `QRFORGE_SMTP_PASSWORD` | empty | SMTP credentials. |
| `QRFORGE_SMTP_FROM` | empty | Sender address. Email is enabled when both host and sender are set. |
| `QRFORGE_MAX_BODY_BYTES` | `1048576` | Maximum API request body size (at least 1024). |
| `QRFORGE_CUSTOM_DOMAIN_SCHEME` | `https` | Scheme used in links for custom domains. |
| `QRFORGE_LOG_FORMAT` | `text` | `text` or `json`. |
| `QRFORGE_RATE_LIMIT_API` | `600` | API requests per minute per IP address. |
| `QRFORGE_RATE_LIMIT_API_KEY` | `600` | API requests per minute per API key. |
| `QRFORGE_RATE_LIMIT_AUTH` | `10` | Sign-in, registration and reset requests per minute per IP address. |
| `QRFORGE_RATE_LIMIT_REDIRECT` | `120` | Redirects per minute per IP address. |

Runtime policies are stored in the database and edited under **Admin → Settings**: registration, per-user code limits, destination allowlist and blocklist, blocking of private destinations, maximum destination length and analytics retention.

## First start

The server applies database migrations at startup. It then creates the administrator from `QRFORGE_ADMIN_EMAIL` and `QRFORGE_ADMIN_PASSWORD` if both are set and no users exist. Otherwise, the first account registered becomes the administrator, even when registration is closed.

`qrforge -migrate` applies migrations and exits. `qrforge -version` prints the version.

## Reverse proxy

Run QRForge behind a proxy that terminates TLS, and list that proxy in `QRFORGE_TRUSTED_PROXIES`. Without it, every request appears to come from the proxy, which breaks rate limiting and unique-visitor counts.

### Caddy

```text
qr.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

```bash
QRFORGE_BASE_URL=https://qr.example.com QRFORGE_TRUSTED_PROXIES=127.0.0.1 ./qrforge
```

For automatic certificates on custom domains, see [Custom domains](./custom-domains#caddy-on-demand-tls).

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name qr.example.com;
    ssl_certificate     /etc/letsencrypt/live/qr.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qr.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Forward the original `Host` header. The redirect service uses it to match custom domains.

## Email

Email is used only for password resets. When SMTP is not configured, the server writes the reset link to its log:

```text
level=WARN msg="password reset requested (SMTP not configured; deliver this link manually)" email=… link=https://qr.example.com/reset-password?token=…
```

An administrator can then send the link to the user. Any SMTP server works, including a self-hosted Postfix or a mail provider's relay.

## Backups

SQLite stores everything in one file (in WAL mode). Stop the server and copy `qrforge.db`, or run `sqlite3 qrforge.db ".backup backup.db"` while it is running.

PostgreSQL:

```bash
pg_dump "$QRFORGE_DATABASE_URL" | gzip > qrforge-$(date +%F).sql.gz
```

All state (users, codes, scans and settings) is in the database. Nothing else on disk needs to be backed up.

## Scaling

- A single instance on SQLite handles typical self-hosted traffic.
- Multiple instances require PostgreSQL. Rate limits are held in memory per instance, so the effective limit grows with the number of instances. See [Kubernetes](./kubernetes).
- Each redirect costs one indexed lookup and one insert.

## Upgrading

Replace the binary or image and restart. Migrations run automatically and are only applied once. Take a backup first.
