# FAQ

## Is QRForge free?

Yes. It is MIT licensed and requires no paid services to develop, run or self-host. There is no paid tier in the code.

## Do I need an account to create a QR code?

No. The Studio generates static codes in the browser without an account or a server. Accounts are needed only for dynamic codes, analytics and saving codes on a QRForge server.

## Is my data sent anywhere?

Not for static codes, which are generated locally by `@qrforge/core`. Uploaded logos are also processed locally. Data reaches a server only when you save a code or create a dynamic code on your own QRForge server.

## Do static codes expire?

No. The content is stored in the pattern itself, so nothing has to stay online.

## What happens to dynamic codes if my server goes down?

They stop redirecting until the server is back, because they point to it. Keep [backups](./docker#backups) and use a hostname you control. If a code must keep working without any infrastructure, make it static.

## Which content types are supported?

URL, plain text, Wi-Fi, contact (vCard 3.0), email (`mailto:`), SMS (`SMSTO:`), phone (`tel:`), location (`geo:` or an OpenStreetMap, Google Maps or Apple Maps link) and calendar events (iCalendar `VEVENT`). Dynamic codes redirect to URLs.

## Will a styled code still scan?

The presets are chosen to scan reliably, and every design is checked as you edit it. Low contrast, inverted colors, a missing quiet zone, very small modules, oversized logos and mixed corner shapes all produce warnings. The core test suite decodes every style with an independent decoder. Still, test with a few phones before printing.

## Which error correction level should I use?

`M` (15%) suits most codes. Use `Q` or `H` when adding a logo or when the code may be damaged. Higher levels produce denser codes.

## Why is the country shown as unknown?

QRForge does not include a GeoIP database or call geolocation services. Set `QRFORGE_COUNTRY_HEADER` to a header added by your CDN or proxy, such as `CF-IPCountry`. See [Analytics](./analytics#countries).

## PostgreSQL or SQLite?

Both are supported. SQLite is built in and suits single-instance installations. PostgreSQL is used by the default Docker Compose stack and is required for running more than one instance.

## Can I run it without Docker?

Yes. The server is a single Go binary; see [Installation](./installation#from-source).

## How do I reset a password without email?

Use **Forgot password**. When SMTP is not configured, the reset link is written to the server log.

## Can I stop others from registering?

Set `QRFORGE_REGISTRATION=closed`, or turn off **Open registration** under **Admin → Settings**. The first account can always register.

## Is there an API?

Yes. The REST API uses API keys and is described by an OpenAPI document at `/api/v1/openapi.yaml`. A JavaScript SDK is also available. See [REST API](./api).

## Can QRForge run on GitHub Pages?

Only the Studio. GitHub Pages serves static files, so the server features (accounts, dynamic codes, analytics) need a self-hosted QRForge server. See [GitHub Pages](./github-pages).
