# Security policy

## Supported versions

Security fixes are released for the latest minor version. Self-hosted installations should run the most recent release.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Do not report security vulnerabilities in public issues, discussions or pull requests.

Report them privately through [GitHub Security Advisories](https://github.com/kspkr/QrForge/security/advisories/new) using **Report a vulnerability**. Include:

- the affected component (web app, API server, redirect service, an npm package or the Docker image),
- the version or commit,
- steps to reproduce, or a proof of concept,
- the expected impact.

Response targets:

| Step | Target |
| --- | --- |
| Acknowledgement | 3 business days |
| Initial assessment | 7 days |
| Fix and coordinated disclosure | As soon as practical, normally within 90 days |

Reporters are credited in the release notes unless they prefer otherwise.

## Scope

In scope: all code in this repository, including authentication and sessions, CSRF protection, API keys, authorization between users, the redirect service (open redirect and SSRF protections), rate limiting, analytics privacy, cross-site scripting in the web app, and the Docker image.

Out of scope: denial of service by traffic volume alone, findings that require a compromised host or administrator account, deployments that ignore the documented configuration (for example serving over plain HTTP on the public internet), and vulnerabilities in third-party dependencies without demonstrated impact on QRForge. Please report those to the upstream project.

## Hardening checklist

- Serve QRForge over HTTPS and set `QRFORGE_BASE_URL` to the `https://` address. This enables `Secure` cookies and HSTS.
- Change `POSTGRES_PASSWORD` and do not expose PostgreSQL to the internet.
- Limit `QRFORGE_TRUSTED_PROXIES` to the addresses of your reverse proxy.
- Close registration under **Admin → Settings** for private installations.
- Keep **Block private destinations** enabled, and use the domain allowlist or blocklist to enforce your policy.
- Back up the database regularly and keep the image up to date.

The [security guide](https://kspkr.github.io/QrForge/docs/guide/security) describes the full threat model.
