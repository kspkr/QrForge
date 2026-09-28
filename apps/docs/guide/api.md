# REST API

Every QRForge server provides a JSON API under `/api/v1`. The complete reference is the OpenAPI 3.1 document served at `/api/v1/openapi.yaml` (source: `apps/api/openapi.yaml`), which works with any OpenAPI viewer or client generator.

## Authentication

The API accepts two kinds of credentials.

### API keys

Create a key in the dashboard under **API keys → New key**. The key (`qrf_…`) is displayed once; the server stores only its SHA-256 hash and a short prefix for display.

```bash
curl https://qr.example.com/api/v1/qrcodes \
  -H "Authorization: Bearer qrf_XXXXXXXXXXXXXXXX"
```

API keys can access QR codes, campaigns, analytics, domains (read only) and the audit log. They cannot manage API keys, change account details (`PATCH /auth/me`, password) or call administrator endpoints; those require a browser session. Keys stop working when their owner is disabled.

### Sessions

Used by the web app. `POST /auth/login` sets an `HttpOnly`, `SameSite=Lax` cookie named `qrforge_session` (`Secure` when the base URL is HTTPS) and returns a `csrf_token`. Cookie-authenticated `POST`, `PATCH`, `PUT` and `DELETE` requests must send that token in an `X-CSRF-Token` header, and requests with a mismatched `Origin` are rejected. Sessions last 30 days.

## Conventions

- Bodies are JSON with snake_case field names. Timestamps are RFC 3339 strings in UTC.
- Request bodies are limited to 1 MiB by default (`QRFORGE_MAX_BODY_BYTES`).
- Lists accept `?page=1&per_page=20` (max 100) and return:

```json
{ "data": [ … ], "pagination": { "page": 1, "per_page": 20, "total": 123 } }
```

### Errors

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Human readable message",
    "fields": { "destination": "must be an http(s) URL" }
  }
}
```

| Status | Codes |
| --- | --- |
| 400 | `invalid_json` |
| 401 | `unauthorized`, `invalid_credentials` |
| 403 | `forbidden`, `csrf_failed`, `registration_closed`, `account_disabled`, `limit_reached` |
| 404 | `not_found` |
| 409 | `conflict` (email or slug taken) |
| 413 | `payload_too_large` |
| 422 | `validation_failed`, `destination_blocked`, `verification_failed` |
| 429 | `rate_limited` (with `Retry-After`) |
| 500 | `internal` |

### Rate limits

Limits are listed in [Security](./security#rate-limiting) and can be adjusted with environment variables ([Self-hosting](./self-hosting#configuration)).

## Example

```bash
curl -X POST https://qr.example.com/api/v1/qrcodes \
  -H "Authorization: Bearer $QRFORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Website","type":"dynamic","destination":"https://example.com"}'
```

```json
{
  "id": "qr_…",
  "slug": "k7Pq2xR",
  "redirect_url": "https://qr.example.com/r/k7Pq2xR",
  "kind": "dynamic",
  "destination": "https://example.com",
  "status": "active",
  "scan_count": 0
}
```

`type` is accepted as an alias of `kind`. Omitting `name` uses the destination's host.

## Endpoints

### Public

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | `{"status":"ok","version":"…","database":"ok"}` (503 if the database is down). |
| GET | `/config` | Version, base URL, `registration_enabled`, `setup_required`, features, limits. |
| GET | `/openapi.yaml` | The OpenAPI document. |
| POST | `/abuse-reports` | Report a code: `{slug, reason, details?, reporter_email?}`. `reason`: `phishing`, `malware`, `spam`, `illegal`, `other`. |
| GET | `/domains/check?domain=` | 200 if a TLS certificate may be issued for the host; used by Caddy on-demand TLS. |

### Authentication

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | `{email, password, name}`. The first user becomes an administrator. Passwords must be 8 to 128 characters. |
| POST | `/auth/login` | `{email, password}` → `{user, csrf_token}` + cookie. |
| POST | `/auth/logout` | Ends the session. |
| GET | `/auth/me` | Current user and CSRF token. |
| PATCH | `/auth/me` | `{name?, email?}` (session only). |
| POST | `/auth/password/change` | `{current_password, new_password}`; signs out other sessions. |
| POST | `/auth/password/forgot` | `{email}` → always 202. Sends a reset link valid for one hour, by email or, without SMTP, to the server log. |
| POST | `/auth/password/reset` | `{token, password}`; signs out all sessions. |

### QR codes

| Method | Path | Description |
| --- | --- | --- |
| POST | `/qrcodes` | Create a static or dynamic code. |
| GET | `/qrcodes` | List. Filters: `kind`, `status`, `campaign_id`, `q`, `sort` (`created_at`, `-created_at`, `name`, `-scan_count`). |
| GET | `/qrcodes/{id}` | Get one. |
| PATCH | `/qrcodes/{id}` | Update. |
| DELETE | `/qrcodes/{id}` | Delete, including scans and history. |
| POST | `/qrcodes/{id}/rotate-slug` | New random slug; the old one stops resolving. |
| POST | `/qrcodes/{id}/duplicate` | Copy (`"<name> (copy)"`, new slug, no scans). |
| GET | `/qrcodes/{id}/history` | Destination changes, newest first. |
| GET | `/qrcodes/{id}/analytics?range=` | [Analytics](./analytics) (`24h`, `7d`, `30d` default, `90d`, `365d`, `all`). |

#### Fields for create and update

| Field | Kind | Notes |
| --- | --- | --- |
| `name` | both | |
| `kind` | both | `dynamic` (default) or `static`; create only. |
| `destination` | dynamic | http(s) URL, validated against server policy. Changes are recorded in history. |
| `qr_type`, `content` | static | `content` is the encoded payload (e.g. `WIFI:…`). |
| `slug` | dynamic | Custom slug `^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`; some words such as `api`, `admin` and `app` are reserved. A random 7-character slug is used if omitted. |
| `status` | both | `active` or `disabled`. Owners cannot re-enable codes locked by an administrator. |
| `expires_at` | dynamic | RFC 3339 or `null`. |
| `password` | dynamic | String to set, `""`/`null` to remove. Stored as a bcrypt hash; responses only show `has_password`. |
| `utm` | dynamic | `{source, medium, campaign, term, content}` or `null`. |
| `analytics_enabled` | dynamic | Default `true`. |
| `campaign_id`, `domain_id` | both / dynamic | `null` clears. |
| `design` | both | Opaque JSON of style options (≤ 256 KB), used by the web app. |
| `form_data` | both | Opaque JSON of the structured input (≤ 64 KB). |

For dynamic codes, `content` equals `redirect_url`, which is the value to encode and print.

### Campaigns, analytics, domains, API keys and audit log

| Method | Path | Description |
| --- | --- | --- |
| GET, POST | `/campaigns` | List / create `{name, description?, color?}`. |
| GET, PATCH, DELETE | `/campaigns/{id}` | Deleting a campaign keeps its codes. |
| GET | `/campaigns/{id}/analytics` | Analytics plus `per_qrcode`. |
| GET | `/analytics/overview` | Analytics across all your codes plus `top_qrcodes`. |
| GET | `/domains` | Your custom domains. |
| POST | `/domains` | `{hostname}` (session only). |
| DELETE | `/domains/{id}` | Session only. |
| POST | `/domains/{id}/verify` | DNS TXT verification (session only). |
| GET, POST | `/api-keys` | List / create `{name}` → `{api_key, key}` (session only). |
| DELETE | `/api-keys/{id}` | Revoke (session only). |
| GET | `/audit-log` | Your security-relevant events. |

### Administration (administrator session only)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/overview` | Counts, storage, system health, 30-day traffic. |
| GET, PATCH | `/admin/users`, `/admin/users/{id}` | Search users; set `role`, `disabled`, `max_qrcodes`. Administrators cannot demote or disable themselves. |
| GET, PATCH | `/admin/qrcodes`, `/admin/qrcodes/{id}` | All codes (with `owner_email`); disabling sets `admin_locked`. |
| GET, PATCH | `/admin/abuse-reports`, `/admin/abuse-reports/{id}` | Filter by `status`; resolve/dismiss, optionally `disable_qrcode`. |
| GET, PATCH | `/admin/settings` | Server policy (see [Security](./security#administrator-settings)). |
| GET | `/admin/audit-log` | All events. |

## Redirect endpoints

Outside `/api/v1`, `GET /r/{slug}` redirects scanners and `POST /r/{slug}` handles the password form. See [Dynamic QR codes](./dynamic-qr-codes).
