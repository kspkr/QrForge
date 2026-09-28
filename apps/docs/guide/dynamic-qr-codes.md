# Dynamic QR codes

A dynamic code encodes a short link on your QRForge server rather than the final destination:

```text
QR code  →  https://qr.example.com/r/menu  →  302  →  current destination
```

The printed pattern never changes, so the destination can be updated at any time. Dynamic codes require a running [QRForge server](./docker).

## Creating a dynamic code

In the dashboard, select **New dynamic code**, or use the API:

```bash
curl -X POST https://qr.example.com/api/v1/qrcodes \
  -H "Authorization: Bearer $QRFORGE_API_KEY" -H "Content-Type: application/json" \
  -d '{
        "name": "Restaurant menu",
        "destination": "https://example.com/menu",
        "slug": "menu",
        "utm": { "source": "table-card", "medium": "print" }
      }'
```

The `redirect_url` field of the response (also returned as `content`) is the value encoded in the QR code. The dashboard renders and exports the styled code.

::: warning Set the base URL before printing
Links are built from `QRFORGE_BASE_URL` or a verified [custom domain](./custom-domains). Set it to the server's public address before printing any codes.
:::

## Options

| Option | Behavior |
| --- | --- |
| Destination | Changes apply on the next scan. Redirects are sent with `Cache-Control: no-store`, so the previous target is not cached. |
| History | Each destination change is recorded with the previous value, time and author (`GET /qrcodes/{id}/history`). |
| Status | Disabled codes show a "QR code disabled" page with HTTP 410. |
| Expiry | After `expires_at`, scanners see a "QR code expired" page (410). |
| Password | Scanners must enter a password, checked with bcrypt on `POST /r/{slug}` and limited to 10 attempts per minute per IP. It is required on every scan. |
| Custom slug | 3 to 64 characters: letters, digits, `-` and `_`, starting with a letter or digit. Without one, a random 7-character slug is generated from an alphabet that excludes look-alike characters. |
| Slug rotation | Generates a new random slug; the old link returns 404 immediately. Use it when a code is leaked or abused, then reprint. |
| UTM parameters | `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` are appended on redirect unless the destination already contains them. Existing query parameters are kept. |
| Analytics | Can be turned off per code. See [Analytics](./analytics). |
| Campaign | Groups codes for comparison. |
| Domain | Serves the code from a verified custom domain. |

## Responses

| Situation | Response |
| --- | --- |
| Active code | `302 Found` to the destination with UTM parameters, and `X-Robots-Tag: noindex` |
| Unknown slug | 404 page |
| Disabled by the owner or an administrator, or the owner's account is disabled | 410 page |
| Expired | 410 page |
| Destination blocked by the current allowlist or blocklist | 410 page |
| Password protected | 200 with a password form |
| Rate limit exceeded | 429 page |

Status pages are small self-contained HTML documents with light and dark themes and no JavaScript. Each includes a **Report abuse** link to `/report?slug=…` in the web app.

`HEAD` requests are redirected but not counted.

## Destination validation

Destinations are validated when saved and again on every redirect, so policy changes also apply to existing codes. A destination must:

- use `http://` or `https://`,
- contain no credentials (`user:pass@`),
- not exceed the maximum length (2048 characters by default, configurable),
- not point to loopback, private, link-local or internal addresses, or to names such as `localhost`, `*.local` and `*.internal` (enabled by default, configurable),
- not point back to the server's own `/r/` links,
- satisfy the administrator's domain allowlist and blocklist, which also match subdomains.

[Security](./security#redirect-abuse) explains the reasoning.

## Static and dynamic codes compared

| | Static | Dynamic |
| --- | --- | --- |
| Requires a server | No | Yes |
| Editable after printing | No | Yes |
| Analytics | No | Yes |
| Works if the server is unavailable | Yes | No |
| Content types | All (Wi-Fi, vCard, text and others) | URLs |

Static codes can also be saved to the dashboard for later editing and downloading. The server is still not involved when they are scanned.
