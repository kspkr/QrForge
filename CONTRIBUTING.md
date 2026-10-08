# Contributing to QRForge

Thank you for your interest in contributing. This document covers setting up the project, the conventions we follow and how changes are reviewed.

## Project principles

Pull requests that conflict with these principles will not be merged:

1. No paid APIs, paid SaaS or proprietary services. An optional integration is acceptable only if a free, local alternative exists.
2. Static generation stays local. The Studio and `@qrforge/core` must never send QR content over the network.
3. Creating and downloading a static code must work without an account or a server.
4. No tracking, third-party scripts, remote fonts or new collection of personal data.
5. Every control in the UI must work. No placeholder pages or features.
6. Frontend and package code is JavaScript (type definitions in `.d.ts` files are welcome). The server is written in Go.
7. Designs must stay scannable. When an option can reduce reliability, add a reliability warning rather than silently producing a risky code.

## Setup

Requirements: Node.js 20+, Go 1.26+ for server work, and optionally Docker.

```bash
git clone https://github.com/kspkr/QrForge.git
cd QrForge
npm install
npm run dev          # API on :8080, web app on http://localhost:5173
```

The [development guide](apps/docs/guide/development.md) lists all commands, and the [architecture overview](apps/docs/guide/architecture.md) explains how the code is organized.

## Repository map

| Area | Path | Tests |
| --- | --- | --- |
| QR encoder and renderers | `packages/core` | `npm test -w @qrforge/core` |
| React components | `packages/react` | `npm test -w @qrforge/react` |
| CLI | `packages/cli` | `npm test -w @qrforge/cli` |
| API client | `packages/sdk` | `npm test -w @qrforge/sdk` |
| Web app (Studio, dashboard, admin) | `apps/web` | `npm test -w @qrforge/web` |
| Server (API, redirects, analytics) | `server/`, `apps/api` | `npm run test:go` |
| Documentation | `apps/docs` | `npm run build:docs` |

## Making a change

1. For anything beyond a small fix, open or comment on an issue first so the approach can be agreed on. Issues labelled [`good first issue`](https://github.com/kspkr/QrForge/labels/good%20first%20issue) are a good starting point.
2. Create a branch from `main`.
3. Add tests. Rendering changes in `packages/core` need a decode round-trip test (the suite decodes output with the independent `jsqr` decoder). Server changes need API tests in `server/api`.
4. Run the checks before pushing:

   ```bash
   npm run lint
   npm test
   npm run test:go
   gofmt -l server apps/api   # must print nothing
   ```

5. Update the documentation in `apps/docs` and the package READMEs when behavior or options change. API changes must also update `apps/api/openapi.yaml`.
6. Open a pull request using the template. Include screenshots of UI changes in both light and dark mode.

## Code style

- Format JavaScript, CSS and Markdown with Prettier (`npm run format`) and Go with `gofmt`.
- Follow the conventions of the surrounding code: naming, structure and comment style.
- Keep dependencies to a minimum. `@qrforge/core` has no runtime dependencies and must stay that way.
- In the web app, use the components in `apps/web/src/components/ui`, keep everything keyboard-accessible, and check both themes and narrow screens.
- Database changes go in a new migration under `server/migrations` and must work on both SQLite and PostgreSQL.

## Commit messages

Use a short imperative subject with a scope, for example `core: add hexagon module style` or `server: rate-limit abuse reports`. Reference issues with `Fixes #123`.

## Reporting bugs and vulnerabilities

- Bugs and feature requests: [GitHub issues](https://github.com/kspkr/QrForge/issues/new/choose).
- Security vulnerabilities must not be reported in public issues. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
