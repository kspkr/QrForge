# JavaScript SDK: `@qrforge/sdk`

A `fetch`-based client for the QRForge [REST API](./api). It has no dependencies and runs in Node.js 18+, Deno, Bun and browsers.

::: tip
The SDK manages codes on a server. To generate QR images, use [`@qrforge/core`](./core).
:::

```bash
npm install @qrforge/sdk
```

## Usage

Create an API key in the dashboard under **API keys**. The key is displayed only once.

```js
import { QRForge } from "@qrforge/sdk";

const qrforge = new QRForge({
  baseUrl: "https://qr.example.com",
  apiKey: process.env.QRFORGE_API_KEY, // "qrf_..."
});

const qr = await qrforge.qrcodes.create({
  name: "Website",
  kind: "dynamic",
  destination: "https://example.com",
});
console.log(qr.redirect_url); // encode and print this

await qrforge.qrcodes.update(qr.id, { destination: "https://example.com/summer" });
const stats = await qrforge.qrcodes.analytics(qr.id, { range: "30d" });
```

Request and response bodies use the API's snake_case field names.

## Client options

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | | Server URL (required). `/api/v1` is appended if missing. |
| `apiKey` | | Sent as `Authorization: Bearer <key>`. |
| `timeoutMs` | `30000` | Per-request timeout; `0` disables it. |
| `fetch` | global `fetch` | Custom implementation. |
| `headers` | | Additional headers sent with every request. |

## Methods

| Method | Endpoint |
| --- | --- |
| `qrcodes.create(body)` | `POST /qrcodes` |
| `qrcodes.list(params)` / `qrcodes.listAll(params)` | `GET /qrcodes` (page / async iterator) |
| `qrcodes.get(id)` | `GET /qrcodes/{id}` |
| `qrcodes.update(id, body)` | `PATCH /qrcodes/{id}` |
| `qrcodes.delete(id)` | `DELETE /qrcodes/{id}` |
| `qrcodes.analytics(id, { range })` | `GET /qrcodes/{id}/analytics` |
| `qrcodes.rotateSlug(id)` | `POST /qrcodes/{id}/rotate-slug` |
| `qrcodes.duplicate(id)` | `POST /qrcodes/{id}/duplicate` |
| `qrcodes.history(id)` | `GET /qrcodes/{id}/history` |
| `campaigns.create/list/listAll/get/update/delete/analytics` | `/campaigns…` |
| `analytics.overview({ range })` | `GET /analytics/overview` |
| `domains.list()` | `GET /domains` |
| `health()`, `config()` | `GET /health`, `GET /config` |
| `request(method, path, { query, body })`, `paginate(path, query)` | Low-level access |

```js
for await (const qr of qrforge.qrcodes.listAll({ kind: "dynamic" })) {
  console.log(qr.name, qr.scan_count);
}
```

## Errors

Failed requests throw `QRForgeAPIError` with `status`, `code`, `message`, `fields` and `retryAfter` (seconds, on `429`). Network failures have `status: 0` and `code: "network_error"`; timeouts have `code: "timeout"`.

```js
import { QRForgeAPIError } from "@qrforge/sdk";

try {
  await qrforge.qrcodes.create({ destination: "javascript:alert(1)" });
} catch (e) {
  if (e instanceof QRForgeAPIError && e.code === "validation_failed") console.log(e.fields);
}
```

::: warning
Keep API keys on the server and never include them in browser code. Keys cannot manage other keys or access administrator endpoints.
:::
