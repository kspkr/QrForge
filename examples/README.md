# Examples

Self-contained examples for the QRForge packages and API. Each folder has its own README.

| Example | Description | Server required |
| --- | --- | --- |
| [`node-basic`](./node-basic) | Generate SVG, PNG and PDF files with `@qrforge/core` | No |
| [`react-vite`](./react-vite) | Live `<QRCode>` with presets and downloads in React | No |
| [`sdk-node`](./sdk-node) | Create dynamic codes and read analytics with `@qrforge/sdk` | Yes |
| [`api-curl`](./api-curl) | The REST API step by step with `curl` | Yes |

The examples depend on the published npm packages. Run `npm install` inside an example folder
before starting it. For a server, run `docker compose up -d` in the repository root.
