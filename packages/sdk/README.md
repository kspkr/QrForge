# @qrforge/sdk

This is a small JavaScript client for the [QRForge](https://github.com/kspkr/QrForge) REST API. Use it to create dynamic QR codes, change where they point, group them into campaigns and read their anonymous scan analytics on your self-hosted QRForge server.

- No dependencies. It's built on `fetch`.
- Works in Node.js 18+, Bun, Deno and modern browsers.
- Ships with TypeScript definitions (the library itself is plain JavaScript).

> This SDK manages codes on a QRForge server. To generate QR images, use [`@qrforge/core`](https://www.npmjs.com/package/@qrforge/core).

## Install

```bash
npm install @qrforge/sdk
```

## Quick start

To get an API key, open the QRForge dashboard and go to **API keys → New key**. The key is displayed only once.

```js
import { QRForge } from "@qrforge/sdk";

const qrforge = new QRForge({
  baseUrl: "https://qr.example.com", // your QRForge server
  apiKey: process.env.QRFORGE_API_KEY, // "qrf_..."
});

const qr = await qrforge.qrcodes.create({
  name: "Website",
  kind: "dynamic",
  destination: "https://example.com",
});

console.log(qr.redirect_url); // https://qr.example.com/r/abc123, the link to encode and print

// Later: change the destination without reprinting anything.
await qrforge.qrcodes.update(qr.id, { destination: "https://example.com/summer-sale" });

const stats = await qrforge.qrcodes.analytics(qr.id, { range: "30d" });
console.log(stats.totals.total_scans, stats.totals.unique_scans);
```

Request and response bodies use the snake_case field names documented in the [API reference](https://github.com/kspkr/QrForge/blob/main/apps/api/openapi.yaml).

## Options

```js
new QRForge({
  baseUrl: "https://qr.example.com", // required; "/api/v1" is added for you
  apiKey: "qrf_...", // sent as "Authorization: Bearer <key>"
  timeoutMs: 30000, // per request; 0 disables the timeout
  fetch: customFetch, // optional fetch implementation
  headers: { "X-Trace": "1" }, // extra headers on every request
});
```

## Methods

### QR codes

| Method                                | Endpoint                                  |
| ------------------------------------- | ----------------------------------------- |
| `qrcodes.create(body)`                | `POST /api/v1/qrcodes`                    |
| `qrcodes.list(params?)`               | `GET /api/v1/qrcodes`                     |
| `qrcodes.listAll(params?)`            | async iterator over every page            |
| `qrcodes.get(id)`                     | `GET /api/v1/qrcodes/:id`                 |
| `qrcodes.update(id, body)`            | `PATCH /api/v1/qrcodes/:id`               |
| `qrcodes.delete(id)`                  | `DELETE /api/v1/qrcodes/:id`              |
| `qrcodes.analytics(id, { range? })`   | `GET /api/v1/qrcodes/:id/analytics`       |
| `qrcodes.rotateSlug(id)`              | `POST /api/v1/qrcodes/:id/rotate-slug`    |
| `qrcodes.duplicate(id)`               | `POST /api/v1/qrcodes/:id/duplicate`      |
| `qrcodes.history(id)`                 | `GET /api/v1/qrcodes/:id/history`         |

`list` parameters: `page`, `per_page` (max 100), `kind` (`static`/`dynamic`), `status` (`active`/`disabled`), `campaign_id`, `q` (search), `sort` (`created_at`, `-created_at`, `name`, `-scan_count`).

`range` for analytics: `24h`, `7d`, `30d` (default), `90d`, `365d`, `all`.

```js
// Dynamic code with password, expiry, UTM tags and a custom slug
await qrforge.qrcodes.create({
  name: "Spring flyer",
  kind: "dynamic",
  destination: "https://shop.example.com/spring",
  slug: "spring-flyer",
  password: "open-sesame",
  expires_at: "2026-06-30T23:59:59Z",
  utm: { source: "flyer", medium: "print", campaign: "spring" },
});

// Static code (the content is encoded directly; no redirect, no analytics)
await qrforge.qrcodes.create({
  name: "Guest Wi-Fi",
  kind: "static",
  qr_type: "wifi",
  content: "WIFI:T:WPA;S:Guest;P:welcome123;;",
});

// Disable a code temporarily
await qrforge.qrcodes.update(id, { status: "disabled" });

// Iterate over everything
for await (const qr of qrforge.qrcodes.listAll({ kind: "dynamic" })) {
  console.log(qr.name, qr.scan_count);
}
```

### Campaigns

| Method                                  | Endpoint                                 |
| --------------------------------------- | ---------------------------------------- |
| `campaigns.create({ name, description?, color? })` | `POST /api/v1/campaigns`      |
| `campaigns.list(params?)`               | `GET /api/v1/campaigns`                  |
| `campaigns.listAll(params?)`            | async iterator over every page           |
| `campaigns.get(id)`                     | `GET /api/v1/campaigns/:id`              |
| `campaigns.update(id, body)`            | `PATCH /api/v1/campaigns/:id`            |
| `campaigns.delete(id)`                  | `DELETE /api/v1/campaigns/:id`           |
| `campaigns.analytics(id, { range? })`   | `GET /api/v1/campaigns/:id/analytics`    |

```js
const summer = await qrforge.campaigns.create({ name: "Summer Campaign", color: "#f59e0b" });
await qrforge.qrcodes.update(flyer.id, { campaign_id: summer.id });
const report = await qrforge.campaigns.analytics(summer.id, { range: "90d" });
console.table(report.per_qrcode);
```

### Analytics, domains and server info

| Method                              | Endpoint                          |
| ----------------------------------- | --------------------------------- |
| `analytics.overview({ range? })`    | `GET /api/v1/analytics/overview`  |
| `domains.list()`                    | `GET /api/v1/domains`             |
| `health()`                          | `GET /api/v1/health`              |
| `config()`                          | `GET /api/v1/config`              |

### Low-level access

```js
await qrforge.request("GET", "/qrcodes", { query: { per_page: 5 } });
for await (const item of qrforge.paginate("/campaigns")) { /* ... */ }
```

## Errors

Failed requests throw a `QRForgeAPIError`:

```js
import { QRForgeAPIError } from "@qrforge/sdk";

try {
  await qrforge.qrcodes.create({ name: "Bad", destination: "javascript:alert(1)" });
} catch (error) {
  if (error instanceof QRForgeAPIError) {
    error.status; // 422
    error.code; // "validation_failed"
    error.message; // human-readable message
    error.fields; // { destination: "must be an http(s) URL" }
    error.retryAfter; // seconds, set on 429 rate_limited
  }
}
```

Network failures use `status: 0` and `code: "network_error"`. Timeouts use `code: "timeout"`.

## Security

- Keep API keys on the server. Never ship them to browsers.
- API keys can't manage other API keys or reach admin endpoints. Those require a dashboard session.

## License

MIT
