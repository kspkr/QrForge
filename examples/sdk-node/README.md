# Node.js SDK: dynamic codes and analytics

Uses [`@qrforge/sdk`](../../packages/sdk) to create a dynamic QR code on your own QRForge server,
render it locally with `@qrforge/core`, change its destination, read analytics and list all codes.

1. Start a QRForge server (for example `docker compose up -d` in the repository root).
2. Sign in and create an API key under **Dashboard → API keys**.
3. Run:

```bash
cd examples/sdk-node
npm install
QRFORGE_URL=http://localhost QRFORGE_API_KEY=qrf_your_key node index.js
```

On Windows PowerShell:

```powershell
$env:QRFORGE_URL="http://localhost"; $env:QRFORGE_API_KEY="qrf_your_key"; node index.js
```
