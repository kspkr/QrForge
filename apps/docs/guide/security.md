# Security

QRForge stores accounts and credentials and exposes a public redirect endpoint. This page describes the threat model, the protections in place and how to report a vulnerability.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Account takeover through password guessing or credential stuffing | bcrypt (cost 12), sign-in rate limits per IP and per email, a generic "invalid credentials" error, and a dummy hash comparison for unknown emails so response times do not reveal which accounts exist. |
| Session theft and CSRF | Random session tokens stored only as hashes; `HttpOnly`, `SameSite=Lax` and `Secure` cookies; a CSRF token header and an `Origin` check on state-changing requests. |
| Leaked API keys | Keys are stored as SHA-256 hashes, shown once, prefixed with `qrf_` so secret scanners can detect them, revocable and limited in scope. |
| Open redirects and phishing through your domain | Destination validation, allowlist and blocklist, re-validation on every redirect, abuse reports and administrator locks. |
| SSRF and access to internal networks | The server never fetches destinations or logos. Private, loopback and internal destinations are rejected, so codes cannot send scanners to internal services. |
| Cross-site scripting | React escapes output, redirect pages use escaped templates, and the Content-Security-Policy forbids inline scripts. |
| SQL injection | All queries are parameterized. |
| Resource exhaustion | Request size limits, rate limits on every endpoint group, per-account code limits and a maximum page size of 100. |
| Scanner privacy | No IP addresses or full user agents are stored; unique counts use daily-rotated salted hashes. See [Analytics](./analytics). |

## Authentication

- Passwords must be 8 to 128 characters and are hashed with bcrypt at cost 12.
- Session tokens contain at least 32 random bytes, and only their SHA-256 hash is stored. Sessions expire after 30 days. Signing out revokes the current session, a password change revokes all other sessions, and a password reset revokes all sessions. Disabling a user revokes their sessions.
- Password reset tokens are random, stored as hashes, valid once and expire after one hour. The request endpoint always responds with 202, so it cannot be used to check whether an account exists.
- Secrets are compared in constant time.

## CSRF protection

Cookie-authenticated `POST`, `PUT`, `PATCH` and `DELETE` requests must include an `X-CSRF-Token` header matching the session's token, which is returned by sign-in and `/auth/me`. Requests whose `Origin` header does not match the server are rejected. Requests authenticated with an API key do not use cookies and are exempt.

## API keys

- Keys have the form `qrf_` followed by 32 random characters. The server stores a SHA-256 hash and a display prefix.
- The full key is shown only once, when it is created.
- Keys cannot manage API keys, change account details or access administrator endpoints.
- Usage counts and last-used times are shown in the dashboard and the admin panel.

## Rate limiting

Limits use in-memory token buckets and are counted per minute unless stated otherwise:

| Scope | Limit |
| --- | --- |
| API, per IP | 600 |
| API, per key | 600 |
| Sign-in, registration and reset, per IP | 10 |
| Sign-in attempts per email | 20 per hour |
| Redirects, per IP | 120 |
| Password form on protected codes, per IP | 10 |
| Abuse reports, per IP | 5 per hour |

Exceeding a limit returns `429` with a `Retry-After` header. `X-Forwarded-For` is honored only when the direct peer is listed in `QRFORGE_TRUSTED_PROXIES`.

## Redirect abuse

A public redirect service can be used to borrow a domain's reputation for phishing links. QRForge limits this as follows:

- Destinations must use `http` or `https`, contain no credentials and stay within the maximum length (2048 characters by default).
- Private, loopback, link-local and internal destinations are blocked by default. This covers IP literals, including encoded forms, and names such as `localhost`, `*.local` and `*.internal`.
- Links to the server's own `/r/` endpoints are rejected, which prevents redirect chains.
- Administrators can configure a domain allowlist and blocklist. Both match subdomains.
- Destinations are checked again on every scan, so a stricter policy applies to existing codes immediately.
- Anyone can report a code through the **Report abuse** link on status pages or at `/report`. Administrators can resolve a report and disable the code in one step.
- Codes disabled by an administrator are locked; their owners cannot re-enable them.
- Redirects are sent with `X-Robots-Tag: noindex` and `Cache-Control: no-store`.

## HTTP security headers

Every response includes:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
  script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none';
  base-uri 'self'; form-action 'self'
```

`Strict-Transport-Security` is added when the base URL uses HTTPS. The web app does not load third-party scripts, fonts or analytics.

## Administrator settings

| Setting (Admin → Settings) | Default |
| --- | --- |
| Open registration | From `QRFORGE_REGISTRATION` (`open`) |
| Maximum codes per user (0 for unlimited, overridable per user) | 0 |
| Maximum destination length | 2048 |
| Block private destinations | On |
| Domain allowlist and blocklist | Empty |
| Analytics retention in days (0 keeps data indefinitely) | 365 |

Administrators can also disable users, grant the administrator role, disable and lock codes, review abuse reports and read the server-wide audit log. The audit log records sign-ins, password changes, API key creation and revocation, code changes and administrator actions.

## Static codes

Static codes are generated on the user's device by `@qrforge/core`. Their content is sent to the server only if the user saves the code to the dashboard.

## Reporting a vulnerability

Do not open a public issue. Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/kspkr/QrForge/security/advisories/new), as described in [SECURITY.md](https://github.com/kspkr/QrForge/blob/main/SECURITY.md).
