# Getting started

QRForge produces two kinds of QR codes:

- **Static codes** contain their content (a URL, Wi-Fi credentials, a contact card) directly in the pattern. They are generated on your device by [`@qrforge/core`](./core), need no server and never expire.
- **Dynamic codes** contain a short link to a QRForge server, such as `https://qr.example.com/r/menu`. The server redirects each scan to the current destination, so you can change it after printing and view scan statistics.

```text
Static:   QR code ──────────────► https://example.com

Dynamic:  QR code ──► /r/menu ──► current destination (editable)
                         │
                         └─► anonymous scan record
```

## Choosing a component

| Goal | Component |
| --- | --- |
| Create a code without an account | The QR Studio (`/studio` in the web app) |
| Generate codes in a JavaScript application | [`@qrforge/core`](./core) |
| Render codes in React | [`@qrforge/react`](./react) |
| Generate codes from a terminal or script | [`qrforge` CLI](./cli) |
| Run dynamic codes, analytics and the API | [QRForge server with Docker](./docker) |
| Automate a QRForge server | [REST API](./api) or [`@qrforge/sdk`](./sdk) |

## Hosted Studio

A static build of the Studio is published on GitHub Pages at <https://kspkr.github.io/QrForge/>. It is the same application with server features turned off: codes are generated and exported locally, but dynamic codes, accounts and analytics are not available. For those, run a QRForge server. See [GitHub Pages](./github-pages) for how the deployment works.

## Quick examples

Generate an SVG in Node.js or the browser:

```bash
npm install @qrforge/core
```

```js
import { generateQR } from "@qrforge/core";

const svg = await generateQR({ data: "https://example.com", format: "svg" });
```

Generate codes from the terminal:

```bash
npx qrforge generate https://example.com            # preview in the terminal
npx qrforge wifi --ssid Cafe --password espresso -o wifi.png
```

Run the full platform:

```bash
git clone https://github.com/kspkr/QrForge.git
cd QrForge
docker compose up -d
```

Open <http://localhost> and register. The first account becomes the administrator. Dynamic codes are created from the dashboard.

## Design constraints

- No paid APIs, cloud services or proprietary QR services are used.
- Static code content is never sent to a server.
- There are no ads or third-party scripts.
- Analytics never store IP addresses or full user-agent strings.

## Next steps

- [Installation](./installation): installing each component.
- [Architecture](./architecture): how the components fit together.
- [Self-hosting](./self-hosting): configuration reference for production.
