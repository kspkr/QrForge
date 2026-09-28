# @qrforge/web

The QRForge web app: the **QR Studio** (static codes, no account, fully local), the **dashboard** (dynamic codes, analytics, campaigns, domains, API keys) and the **admin panel**.

Built with React 19, Vite, Tailwind CSS 4 and React Router. Plain JavaScript — no TypeScript.

## Run it

```bash
# from the repository root
npm install
npm run dev          # API (:8080) + this app (:5173)
npm run dev:web      # this app only — the Studio works without a server
```

In development, `/api` and `/r/` are proxied to `http://localhost:8080` (override with `QRFORGE_API_URL`).

```bash
npm run build -w @qrforge/web   # → apps/web/dist, served by the Go server via QRFORGE_WEB_DIR
npm test -w @qrforge/web        # Vitest + Testing Library
npm run lint -w @qrforge/web
```

## How it's organised

```text
src/
├── App.jsx                 routes; dashboard and admin pages are lazy-loaded
├── pages/                  Landing, Studio, auth pages, app/* (dashboard), admin/*
├── components/
│   ├── studio/             ContentForm, DesignPanel, PreviewPanel (shared with the dashboard)
│   ├── charts/             dependency-free SVG charts (time series, bar lists, stat tiles)
│   ├── layout/             site header/footer, dashboard shell
│   └── ui/                 buttons, fields, dialogs, menus, toasts
├── lib/                    API client, session, theme, QR type definitions, design mapping
└── styles/index.css        Tailwind theme tokens (ember accent, dark mode)
```

## Principles

- **Static generation never touches the network.** The Studio uses `@qrforge/core` and `@qrforge/react` in the browser. Only the design and selected type are remembered in `localStorage` — never the content (which may contain Wi-Fi passwords).
- **Server features appear only when a server is reachable.** The app probes `/api/v1/config`; on a static host it's a pure Studio.
- **Strict CSP-compatible.** No inline scripts, no third-party requests; fonts are self-hosted via Fontsource.
- **Accessible.** Keyboard-operable controls, focus management in dialogs and menus, labelled charts with table views, reduced-motion support.

## Configuration

| Variable          | Default                               | Purpose                          |
| ----------------- | ------------------------------------- | -------------------------------- |
| `VITE_REPO_URL`   | `https://github.com/kspkr/QrForge`  | GitHub links                     |
| `VITE_DOCS_URL`   | repo `apps/docs` folder               | Documentation links              |
| `QRFORGE_API_URL` | `http://localhost:8080`               | Dev-server proxy target          |
