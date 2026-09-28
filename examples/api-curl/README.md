# REST API with curl

A walkthrough of the QRForge REST API using nothing but `curl`. The full reference is the
OpenAPI spec served by your server at `/api/v1/openapi.yaml` (source:
[`apps/api/openapi.yaml`](../../apps/api/openapi.yaml)).

## 1. Get an API key

1. Start QRForge (`docker compose up -d` in the repository root) and open http://localhost.
2. Create an account (the first account becomes the administrator).
3. Go to **Dashboard → API keys → New key** and copy the key. It starts with `qrf_` and is
   shown only once; QRForge stores only a hash of it.

```bash
export QRFORGE=http://localhost
export KEY=qrf_your_key_here
```

API keys can manage QR codes, campaigns and analytics. They cannot manage your account, other
API keys or admin settings.

## 2. Create a dynamic QR code

```bash
curl -s -X POST "$QRFORGE/api/v1/qrcodes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Restaurant menu",
    "kind": "dynamic",
    "destination": "https://example.com/menu",
    "slug": "menu",
    "utm": { "source": "table-card", "medium": "print" }
  }'
```

```json
{
  "id": "qr_…",
  "kind": "dynamic",
  "slug": "menu",
  "redirect_url": "http://localhost/r/menu",
  "destination": "https://example.com/menu",
  "status": "active",
  "scan_count": 0
}
```

Encode `redirect_url` in the printed QR code (for example with
`qrforge generate http://localhost/r/menu -o menu.svg`). Scanners are redirected to the current
destination, with the UTM parameters appended.

Save the id:

```bash
export ID=qr_…
```

## 3. List your codes

```bash
curl -s "$QRFORGE/api/v1/qrcodes?kind=dynamic&page=1&per_page=20" \
  -H "Authorization: Bearer $KEY"
```

Responses are paginated: `{ "data": [...], "pagination": { "page": 1, "per_page": 20, "total": 3 } }`.

## 4. Change the destination

```bash
curl -s -X PATCH "$QRFORGE/api/v1/qrcodes/$ID" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{ "destination": "https://example.com/winter-menu" }'
```

The printed code now points to the new URL. Every change is recorded:

```bash
curl -s "$QRFORGE/api/v1/qrcodes/$ID/history" -H "Authorization: Bearer $KEY"
```

Other useful fields for `PATCH`: `status` (`"active"` / `"disabled"`), `expires_at`
(RFC 3339 or `null`), `password` (string to set, `null` to remove), `analytics_enabled`,
`campaign_id`.

## 5. Scan it and read analytics

```bash
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" \
  -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" \
  "$QRFORGE/r/menu"

curl -s "$QRFORGE/api/v1/qrcodes/$ID/analytics?range=7d" -H "Authorization: Bearer $KEY"
```

`range` is one of `24h`, `7d`, `30d`, `90d`, `365d`, `all`. The response contains
`totals` (total, unique, today, this week, this month), a zero-filled `timeseries`, and
breakdowns by browser, OS, device, country and referrer. No IP addresses are stored.

## 6. Rotate the slug

If a printed code leaks or is abused, give it a new random short link. The old link stops
working immediately.

```bash
curl -s -X POST "$QRFORGE/api/v1/qrcodes/$ID/rotate-slug" -H "Authorization: Bearer $KEY"
```

## 7. Clean up

```bash
curl -s -X DELETE "$QRFORGE/api/v1/qrcodes/$ID" -H "Authorization: Bearer $KEY" -w "%{http_code}\n"
```

## Errors

Errors use one shape:

```json
{ "error": { "code": "validation_failed", "message": "…", "fields": { "destination": "must be an http(s) URL" } } }
```

Rate-limited requests return `429` with a `Retry-After` header.
