# Development

Development requires Node.js 20+ and Go 1.26+. Docker is optional and only needed to develop against PostgreSQL.

## Setup

```bash
git clone https://github.com/kspkr/QrForge.git
cd QrForge
npm install          # installs every JavaScript workspace
npm run dev          # Go API on :8080 and web app on :5173
```

Open <http://localhost:5173>. `npm run dev` runs `scripts/dev.mjs`, which:

- builds the Go server into `.dev/` and starts it with SQLite at `.dev/qrforge.db` and `QRFORGE_BASE_URL=http://localhost:5173`,
- starts Vite for `apps/web`, which proxies `/api` and `/r/` to the API on `:8080`,
- prefixes each process's log output and stops both on Ctrl+C.

Register an account in the browser. The first account becomes the administrator.

Other ways to run it:

```bash
npm run dev:web                          # web app only; the Studio works without the API
npm run api                              # API only (cd apps/api && go run .)
npm run dev:docs                         # this documentation site

# Against PostgreSQL
docker compose up -d postgres
QRFORGE_DATABASE_URL="postgres://qrforge:qrforge@localhost:5432/qrforge?sslmode=disable" npm run dev
```

To run the components separately:

```bash
cd apps/api && go run .                  # API (SQLite at apps/api/data/qrforge.db)
cd apps/web && npm run dev               # web app (http://localhost:5173)
```

## Workspaces

| Path | Package | Tests |
| --- | --- | --- |
| `packages/core` | `@qrforge/core` | `node --test`; every style is decoded with the independent jsQR decoder |
| `packages/react` | `@qrforge/react` | Vitest and Testing Library |
| `packages/cli` | `@qrforge/cli` | `node --test`, running the CLI as a child process |
| `packages/sdk` | `@qrforge/sdk` | `node --test` with a mocked `fetch` and a real HTTP server |
| `apps/web` | `@qrforge/web` | Vitest and Testing Library |
| `apps/docs` | `@qrforge/docs` | The build fails on dead links |
| `server/`, `apps/api` | Go module `github.com/kspkr/QrForge` | `go test` (unit tests and `httptest` API tests) |

The JavaScript packages are ES modules without a build step. The web app imports them directly from the workspace.

## Commands

```bash
npm test                 # all JavaScript workspaces
npm run test:go          # go test ./server/... ./apps/api/...
npm run lint             # ESLint (web app)
npm run build            # production build of apps/web
npm run build:docs       # build this site
npm run format           # Prettier
gofmt -l server apps/api && go vet ./server/... ./apps/api/...
```

Use `npm run test:go` rather than `go test ./...`, which also descends into `node_modules`.

The Go storage and API tests use temporary SQLite databases. Set `QRFORGE_TEST_POSTGRES_URL` to run them against PostgreSQL as well.

## Conventions

- Frontend and package code is JavaScript. Packages ship `.d.ts` files for TypeScript users.
- No paid or proprietary services, no trackers, and no assets loaded from CDNs at runtime. Fonts are bundled.
- API changes must update `apps/api/openapi.yaml` and this documentation.
- Every UI control must work; no placeholder features.
