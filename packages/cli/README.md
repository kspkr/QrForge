# @qrforge/cli

Command-line tool for creating QR codes from URLs, Wi-Fi networks, contacts, email, SMS, locations and calendar events. It writes SVG, PNG or PDF files, or draws the code in the terminal.

- Works offline; nothing is sent over the network.
- Supports presets, colors, module and corner styles, logos, labels and frames, and warns when a design may be hard to scan.
- Suitable for scripts: output can go to stdout (`-o -`), exit codes are documented, and it never prompts when stdin is not a terminal.

Built on [`@qrforge/core`](https://www.npmjs.com/package/@qrforge/core).

## Installation

```bash
npm install -g @qrforge/cli
# or run without installing
npx @qrforge/cli generate https://example.com
```

Requires Node.js 18 or newer.

## Usage

```bash
qrforge generate https://example.com                  # preview in the terminal
qrforge generate https://example.com --format svg     # writes ./qrcode.svg
qrforge generate https://example.com --output qr.svg  # format inferred from the extension
qrforge wifi --ssid HomeNetwork --password 'correct horse' -o wifi.png
```

## Where output goes

| You pass                          | Result                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| neither `--output` nor `--format` | the code is shown in the terminal with a payload summary   |
| `--format <fmt>` only             | `qrcode.<fmt>` is written to the current directory         |
| `--output <file>`                 | `<file>` is written; the format comes from `.svg/.png/.pdf` |
| `--output -`                      | raw output goes to stdout (SVG by default)                 |
| `-t, --terminal`                  | the terminal preview is also shown (on stderr when writing a file) |

## Commands

### `generate <data>`

Encodes any text exactly as you give it. Pass `-` to read the data from stdin.

```bash
qrforge generate "Hello, world" -o hello.png --size 1024
echo "https://example.com" | qrforge generate - -o qr.svg
```

### `url <url>`

Encodes a website link and adds `https://` when the URL has no scheme. Only `http(s)` URLs are accepted.

```bash
qrforge url example.com/menu -o menu.pdf --label "Scan for the menu"
```

### `text <text>`

```bash
qrforge text "Table 12 — ask for the specials"
```

### `wifi`

| Flag           | Description                             |
| -------------- | --------------------------------------- |
| `--ssid`       | Network name (required)                 |
| `--password`   | Password (required unless `nopass`)     |
| `--encryption` | `WPA` (default), `WEP` or `nopass`      |
| `--hidden`     | Set this when the network is hidden     |

```bash
qrforge wifi --ssid Guest --encryption nopass -o guest.png
```

The terminal preview masks the password.

### `vcard`

This command builds a contact card. You need at least a name (`--first` or `--last`) or `--org`.

`--first --last --org --title --phone --mobile --email --website --street --city --region --zip --country --note`

```bash
qrforge vcard --first Ada --last Lovelace --org "Analytical Engines" \
  --email ada@example.com --phone "+44 20 1234 5678" -o ada.svg
```

### `email`

`--to` (required), `--subject`, `--body`, `--cc`, `--bcc`

```bash
qrforge email --to hello@example.com --subject "Hi" --body "I saw your poster"
```

### `sms`

`--phone` (required), `--message`

```bash
qrforge sms --phone +15551234567 --message JOIN
```

### `phone <number>`

```bash
qrforge phone +15551234567
```

### `location`

Give either `--lat` and `--lng`, or `--address`. `--map` sets the payload: `geo` (default, a `geo:` URI), `osm` (OpenStreetMap link), `google` or `apple`.

```bash
qrforge location --lat 48.8584 --lng 2.2945
qrforge location --address "Eiffel Tower, Paris" --map osm
```

### `calendar` (alias `event`)

`--title` and `--start` are required. The other flags are `--end`, `--all-day`, `--location` and `--description`. Dates use ISO 8601 (`2026-05-01T18:00:00Z`). With `--all-day`, pass plain dates (`2026-05-01`).

```bash
qrforge event --title "Launch party" --start 2026-05-01T18:00:00Z \
  --end 2026-05-01T21:00:00Z --location "HQ" -o launch.pdf
```

## Output & style options

These work with every command.

| Option                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `--format`            | `svg`, `png` or `pdf`                                             |
| `-o, --output`        | Output file, or `-` for stdout                                    |
| `-t, --terminal`      | Show the terminal preview                                         |
| `--size`              | Width in pixels (default 512)                                     |
| `--margin`            | Quiet zone in modules (default 4)                                 |
| `--ecc`               | Error correction `L`, `M` (default), `Q`, `H`. The default becomes `H` when a logo is used |
| `--fg`, `--bg`        | Hex colors                                                        |
| `--transparent`       | Transparent background                                            |
| `--style`             | Modules: `square`, `rounded`, `soft`, `dots`                      |
| `--corner`            | Finder pattern: `square`, `rounded`, `circle`                     |
| `--corner-dot`        | Finder centre: `square`, `rounded`, `circle`                      |
| `--corner-color`      | Colour of the finder patterns                                     |
| `--logo <file>`       | Logo image. PNG works for PNG/PDF output; any image works for SVG |
| `--logo-size`         | Fraction of the width, 0.05–0.35 (default 0.22)                   |
| `--label <text>`      | Text under the code (SVG and PDF)                                 |
| `--frame`             | `none`, `box` or `banner`                                         |
| `--frame-color`       | Frame color                                                       |
| `--preset <id>`       | `minimal`, `business`, `modern`, `rounded`, `dark`, `elegant`     |
| `--page-size`         | PDF page: `fit` (default), `A4`, `Letter`, `A5`                   |

```bash
qrforge url example.com --preset modern -o modern.png
qrforge url example.com --preset dark --label "SCAN ME" -o poster.pdf --page-size A4
qrforge url example.com --logo brand.png --logo-size 0.2 -o branded.png
```

> Text labels in PNG output need a browser canvas. In Node.js, use SVG or PDF for labelled codes.

## Scan reliability

When a design might not scan well, the CLI prints warnings to stderr. Examples include low contrast, inverted colors, a missing quiet zone, oversized logos and mixed corner shapes. Always test-scan a code before you print it.

## Exit codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| 0    | Success                                                     |
| 1    | Usage or input error (clear message on stderr)              |
| 2    | Unexpected error. Set `QRFORGE_DEBUG=1` to see a stack trace |

If required fields are missing and stdin is a terminal, `qrforge` prompts for them (Wi-Fi passwords are masked). In scripts it exits with code 1 and lists the missing flags.

Colour output follows the [`NO_COLOR`](https://no-color.org) convention.

## License

MIT
