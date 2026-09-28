# Analytics

The QRForge server records scan statistics for [dynamic codes](./dynamic-qr-codes). Data stays on your server; no third-party analytics service is used.

## Recorded fields

| Field | Source |
| --- | --- |
| Time | Server clock, stored as Unix seconds and reported in UTC. |
| Browser | Browser family parsed from the user agent, such as `Safari` or `Chrome`. |
| Operating system | Operating system family, such as `iOS`, `Android` or `Windows`. |
| Device | `mobile`, `tablet`, `desktop` or `other`. |
| Country | Two-letter code from a header set by your proxy or CDN, when `QRFORGE_COUNTRY_HEADER` is configured. |
| Referrer host | Host name only. Most scans have no referrer. |
| Visitor hash | Used to count unique scans; see below. |

The following are never stored: IP addresses, full user-agent strings, full referrer URLs, cookies or other cross-site identifiers, and any data about static codes.

## Unique scans

Each scan stores a 16-character visitor hash:

```text
sha256(daily_salt ‖ IP ‖ user agent ‖ QR code id)[:16]
```

The salt is random, generated for each UTC day and deleted after two days. As a result:

- the same device scanning the same code twice on one day counts as one unique scan,
- visitors cannot be linked across codes (the code ID is part of the hash) or across days (the salt changes),
- once a salt is deleted, nobody, including the server operator, can recompute or reverse the hash.

For ranges longer than a day, unique scans are the sum of daily unique visitors.

## Excluded traffic

Scans are not counted when the user agent is empty or identifies a crawler, link-preview service, monitoring tool or HTTP library. Examples include Googlebot, `facebookexternalhit`, WhatsApp, Telegram, Discord and Slack previews, `curl`, `wget`, `python-requests`, headless Chrome and uptime monitors. `HEAD` requests are not counted either. Excluded requests are still redirected.

## Countries

QRForge does not include a GeoIP database. To record countries, run the server behind a proxy or CDN that adds a country header and set its name:

```bash
QRFORGE_COUNTRY_HEADER=CF-IPCountry     # Cloudflare
```

Only use this when the server is reachable exclusively through that proxy; otherwise clients can forge the header. Values are normalized to two-letter codes. Without the header, countries are reported as unknown.

## Reports

Reports are available per code, per campaign and across all of your codes, in the dashboard under **Analytics** and through the API:

- Totals: all-time scans and unique scans, plus scans today (since 00:00 UTC), this week (since Monday 00:00 UTC) and this month (since the 1st, UTC).
- A time series for the selected range: hourly for `24h`, daily for `7d`, `30d`, `90d`, `365d` and `all`. Empty buckets are reported as zero.
- The top 10 browsers, operating systems, devices, countries and referrers in the range.
- Per-code breakdowns for campaigns, and a list of top codes in the overview.

## Disabling and retention

- Per code: turn off **Collect analytics** (`analytics_enabled: false`). Redirects continue to work and no scans are recorded.
- Retention: administrators set how long scans are kept under **Admin → Settings** (default 365 days; `0` keeps them indefinitely). An hourly job deletes older scans.
- Deleting a code deletes its scans.
