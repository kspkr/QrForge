# CLI: `qrforge`

The `qrforge` command generates QR codes from a terminal or script. It is built on [`@qrforge/core`](./core) and works offline.

```bash
npm install -g @qrforge/cli
# or without installing
npx @qrforge/cli generate https://example.com
```

Requires Node.js 18+.

## Examples

```bash
qrforge generate https://example.com                  # preview in the terminal
qrforge generate https://example.com --format svg     # writes ./qrcode.svg
qrforge generate https://example.com --output qr.svg  # format inferred from the extension
qrforge wifi --ssid HomeNetwork --password 'correct horse' -o wifi.png
qrforge --help
qrforge --version
```

## Output destination

| Flags | Result |
| --- | --- |
| Neither `--output` nor `--format` | The code is drawn in the terminal with a summary of the payload. |
| `--format <fmt>` only | `qrcode.<fmt>` is written to the current directory. |
| `--output <file>` | `<file>` is written; format from `.svg` / `.png` / `.pdf`. |
| `--output -` | Raw output to stdout (SVG by default). PNG/PDF bytes are refused when stdout is a terminal. |
| `-t, --terminal` | Also show the terminal preview (on stderr when writing a file). |

## Commands

| Command | Required | Other flags |
| --- | --- | --- |
| `generate <data>` | data (`-` reads stdin) | — |
| `url <url>` | url | Adds `https://` if no scheme is given |
| `text <text>` | text | — |
| `wifi` | `--ssid`, `--password` (unless `nopass`) | `--encryption WPA\|WEP\|nopass`, `--hidden` |
| `vcard` | `--first`/`--last` or `--org` | `--title --phone --mobile --email --website --street --city --region --zip --country --note` |
| `email` | `--to` | `--subject --body --cc --bcc` |
| `sms` | `--phone` | `--message` |
| `phone <number>` | number | — |
| `location` | `--lat` + `--lng`, or `--address` | `--map geo\|osm\|google\|apple` |
| `calendar` / `event` | `--title`, `--start` | `--end --all-day --location --description` (ISO 8601 dates) |

Run `qrforge help <command>` or `qrforge <command> --help` for details.

```bash
qrforge vcard --first Ada --last Lovelace --org "Analytical Engines" --email ada@example.com -o ada.svg
qrforge location --address "Eiffel Tower, Paris" --map osm
qrforge event --title "Launch party" --start 2026-05-01T18:00:00Z --end 2026-05-01T21:00:00Z -o launch.pdf
echo "https://example.com" | qrforge generate - -o qr.svg
```

## Style and output options

| Option | Description |
| --- | --- |
| `--format` | `svg`, `png`, `pdf` |
| `-o, --output` | Output file, or `-` for stdout |
| `--size` | Width in pixels (default 512) |
| `--margin` | Quiet zone in modules (default 4) |
| `--ecc` | `L`, `M` (default), `Q` or `H`. Defaults to `H` when `--logo` is used. |
| `--fg`, `--bg`, `--transparent` | Colors |
| `--style` | `square`, `rounded`, `soft`, `dots` |
| `--corner`, `--corner-dot`, `--corner-color` | Finder patterns |
| `--logo <file>`, `--logo-size` | Logo (PNG for PNG/PDF output; any image for SVG) |
| `--label <text>` | Text under the code (SVG and PDF) |
| `--frame`, `--frame-color` | `none`, `box`, `banner` |
| `--preset <id>` | `minimal`, `business`, `modern`, `rounded`, `dark`, `elegant` |
| `--page-size` | PDF page: `fit`, `A4`, `Letter`, `A5` |

::: warning Labels in PNG
Text labels in PNG need a browser canvas. In the CLI (Node.js), use SVG or PDF for labelled codes.
:::

## Use in scripts

- Reliability warnings, such as low contrast, a missing quiet zone or an oversized logo, are printed to stderr.
- When stdin is a terminal, the CLI prompts for missing required fields and masks Wi-Fi passwords. Otherwise it exits with code 1 and lists the missing flags.
- Exit codes: `0` for success, `1` for usage or input errors, `2` for unexpected errors. Set `QRFORGE_DEBUG=1` to print a stack trace.
- Colored output respects [`NO_COLOR`](https://no-color.org).
