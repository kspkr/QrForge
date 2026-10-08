<div align="center">

<img src="assets/logo.svg" width="64" height="64" alt="QRForge" />

# QRForge

Open-source QR code platform: a browser-based designer, embeddable libraries,<br />
and a self-hosted server for dynamic codes and privacy-respecting analytics.

[Live Studio](https://kspkr.github.io/QrForge/) · [Documentation](https://kspkr.github.io/QrForge/docs/) · [Self-hosting](#self-hosting) · [API](apps/api/openapi.yaml)

[![CI](https://github.com/kspkr/QrForge/actions/workflows/ci.yml/badge.svg)](https://github.com/kspkr/QrForge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@qrforge/core?label=%40qrforge%2Fcore)](https://www.npmjs.com/package/@qrforge/core)

</div>

<p align="center">
  <img src="assets/screenshot-studio.jpg" alt="QRForge Studio" width="880" />
</p>

## Overview

QRForge covers the full lifecycle of a QR code:

- **Design** codes in the browser with colors, module and corner shapes, logos, frames and presets. A live check warns when a design is likely to scan poorly.
- **Export** PNG, SVG or vector PDF. Static codes are generated entirely on the client; nothing is uploaded.
- **Publish dynamic codes** from your own server. The printed code points to a short link whose destination you can change, schedule to expire, password-protect or disable.
- **Measure** scans with anonymous analytics: totals, unique visitors, devices, operating systems, browsers, countries and referrers.
- **Integrate** through a documented REST API, a JavaScript SDK, a CLI and React components.

Everything runs on free, open-source software. There are no paid services or third-party trackers, and nothing requires an external account.

### Supported content

URL, plain text, Wi-Fi, contact (vCard), email, SMS, phone, location and calendar event.

## Static and dynamic codes

| | Static | Dynamic |
| --- | --- | --- |
| Encoded content | The data itself | A short link, e.g. `https://qr.example.com/r/menu` |
| Server required | No | Yes (QRForge server) |
| Editable after printing | No | Yes |
| Analytics, expiry, password | No | Yes |

## Quick start

The [hosted Studio](https://kspkr.github.io/QrForge/) generates static codes with no installation. To run the full platform:

```bash
git clone https://github.com/kspkr/QrForge.git
cd QrForge
docker compose up -d
```

Open http://localhost and register. The first account becomes the administrator.

## Packages

| Package | Description |
| --- | --- |
| [`@qrforge/core`](packages/core) | QR encoder and SVG/PNG/PDF renderer with no runtime dependencies. Works in browsers and Node.js. |
| [`@qrforge/react`](packages/react) | `<QRCode>` component, `useQRCode` hook and download helpers. |
| [`@qrforge/cli`](packages/cli) | Command-line generator. Works offline. |
| [`@qrforge/sdk`](packages/sdk) | Client for the REST API. |

```js
import { generateQR } from "@qrforge/core";

const svg = await generateQR({ data: "https://example.com", format: "svg" });
const png = await generateQR({
  type: "wifi",
  data: { ssid: "Office", password: "correct-horse" },
  format: "png",
  moduleStyle: "rounded",
});
```

```jsx
import { QRCode } from "@qrforge/react";

<QRCode value="https://example.com" size={256} preset="modern" />;
```

```bash
npm install -g @qrforge/cli
qrforge generate https://example.com -o code.svg
qrforge wifi --ssid Office --password correct-horse -o wifi.png
```

## REST API

```bash
curl -X POST https://qr.example.com/api/v1/qrcodes \
  -H "Authorization: Bearer $QRFORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Menu", "type": "dynamic", "destination": "https://example.com/menu"}'
```

API keys are created in the dashboard. The OpenAPI 3.1 specification is in [`apps/api/openapi.yaml`](apps/api/openapi.yaml) and is served by every instance at `/api/v1/openapi.yaml`.

## Self-hosting

| Setup | Command |
| --- | --- |
| PostgreSQL (recommended) | `docker compose up -d` |
| Single container, SQLite | `docker compose -f docker/docker-compose.sqlite.yml up -d` |
| Automatic HTTPS and custom domains (Caddy) | `QRFORGE_DOMAIN=qr.example.com docker compose -f docker-compose.yml -f docker/docker-compose.caddy.yml up -d` |

Configuration uses `QRFORGE_*` environment variables; see [`.env.example`](.env.example). The documentation covers [self-hosting](https://kspkr.github.io/QrForge/docs/guide/self-hosting), [custom domains](https://kspkr.github.io/QrForge/docs/guide/custom-domains), [Kubernetes](https://kspkr.github.io/QrForge/docs/guide/kubernetes) and [security](https://kspkr.github.io/QrForge/docs/guide/security).

<p align="center">
  <img src="assets/screenshot-analytics.jpg" alt="Analytics for a dynamic code" width="880" />
</p>

## Development

Requirements: Node.js 20 or later, and Go 1.26 or later for the server.

```bash
npm install
npm run dev
```

This builds the API, starts it on port 8080 with a local SQLite database, and serves the web app at http://localhost:5173.

| Command | Description |
| --- | --- |
| `npm run dev` | API and web app together |
| `npm run dev:web` | Web app only (Studio works without the API) |
| `npm run dev:docs` | Documentation site |
| `npm test` | JavaScript test suites |
| `npm run test:go` | Go test suites |
| `npm run lint` | Lint all workspaces |
| `npm run build` | Production build of the web app |

To develop against PostgreSQL, start it with `docker compose up -d postgres` and set `QRFORGE_DATABASE_URL=postgres://qrforge:qrforge@localhost:5432/qrforge?sslmode=disable`.

## Project structure

```text
apps/web        React web app: Studio, dashboard, admin
apps/api        Server entry point and OpenAPI specification
apps/docs       Documentation site (VitePress)
packages/core   QR encoder and renderers
packages/react  React bindings
packages/cli    Command-line tool
packages/sdk    REST API client
server/         Go packages: storage, auth, security, analytics, redirects
docker/         Dockerfile, Compose variants, Caddyfile
examples/       Runnable examples
```

## Privacy and security

Static codes never leave the browser. For dynamic codes, the server stores no IP addresses or full user-agent strings. Unique visitors are counted with a salted hash that rotates daily, bots are excluded, and retention is configurable.

Passwords are hashed with bcrypt, and session tokens and API keys are stored only as hashes. State-changing requests require CSRF tokens, and all endpoints are rate-limited. Redirect destinations are validated to prevent open-redirect and internal-network abuse. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

## License

[MIT](LICENSE). QR Code is a registered trademark of DENSO WAVE INCORPORATED.
