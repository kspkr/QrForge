/**
 * Command definitions. Each command declares its own flags, which fields are
 * required (for validation and interactive prompts) and how to turn parsed
 * values into a QR payload using @qrforge/core's payload builders.
 */

import { url, text, wifi, vcard, email, sms, phone, location, calendar } from "@qrforge/core";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/**
 * Field descriptor:
 *   key      – value key (same as the flag name)
 *   label    – prompt label
 *   secret   – mask input while prompting
 *   required – (values) => boolean
 */
export const COMMANDS = {
  generate: {
    summary: "Encode any text or URL exactly as given",
    usage: "qrforge generate <data> [options]",
    positional: "data",
    options: {},
    fields: [{ key: "data", label: "Data to encode", required: () => true, flag: "<data>" }],
    build: (v) => v.data,
    type: "text",
    examples: [
      "qrforge generate https://example.com",
      "qrforge generate https://example.com --format svg",
      "qrforge generate https://example.com --output qr.svg",
      "qrforge generate \"Hello, world\" -o hello.png --size 1024",
    ],
  },
  url: {
    summary: "Website link (adds https:// when missing)",
    usage: "qrforge url <url> [options]",
    positional: "url",
    options: { url: { type: "string", description: "URL to open" } },
    fields: [{ key: "url", label: "URL", required: () => true, flag: "<url>" }],
    build: (v) => url(v.url),
    type: "url",
    examples: ["qrforge url example.com -o site.png"],
  },
  text: {
    summary: "Plain text",
    usage: "qrforge text <text> [options]",
    positional: "text",
    options: { text: { type: "string", description: "Text content" } },
    fields: [{ key: "text", label: "Text", required: () => true, flag: "<text>" }],
    build: (v) => text(v.text),
    type: "text",
    examples: ['qrforge text "Table 12 — ask for the specials"'],
  },
  wifi: {
    summary: "Wi-Fi network (joins with one scan on iOS and Android)",
    usage: "qrforge wifi --ssid <name> --password <password> [options]",
    options: {
      ssid: { type: "string", description: "Network name" },
      password: { type: "string", description: "Network password" },
      encryption: { type: "string", description: "WPA (default), WEP or nopass" },
      hidden: { type: "boolean", description: "Network is hidden" },
    },
    fields: [
      { key: "ssid", label: "Network name (SSID)", required: () => true },
      {
        key: "password",
        label: "Password",
        secret: true,
        required: (v) => String(v.encryption ?? "WPA").toLowerCase() !== "nopass",
      },
    ],
    build: (v) => wifi({ ssid: v.ssid, password: v.password, encryption: v.encryption ?? "WPA", hidden: v.hidden }),
    type: "wifi",
    mask: (payload) => payload.replace(/(;P:)((?:\\.|[^;])*)/, (_, p) => `${p}••••••`),
    examples: [
      "qrforge wifi --ssid HomeNetwork --password 'correct horse' -o wifi.png",
      "qrforge wifi --ssid Guest --encryption nopass",
    ],
  },
  vcard: {
    summary: "Contact card (vCard 3.0)",
    usage: "qrforge vcard --first <name> --last <name> [fields] [options]",
    options: {
      first: { type: "string", description: "First name" },
      last: { type: "string", description: "Last name" },
      org: { type: "string", description: "Organization" },
      title: { type: "string", description: "Job title" },
      phone: { type: "string", description: "Work phone" },
      mobile: { type: "string", description: "Mobile phone" },
      email: { type: "string", description: "Email address" },
      website: { type: "string", description: "Website" },
      street: { type: "string", description: "Street address" },
      city: { type: "string", description: "City" },
      region: { type: "string", description: "State / region" },
      zip: { type: "string", description: "Postal code" },
      country: { type: "string", description: "Country" },
      note: { type: "string", description: "Note" },
    },
    fields: [
      {
        key: "first",
        label: "First name",
        flag: "--first/--last or --org",
        required: (v) => !has(v.first) && !has(v.last) && !has(v.org),
      },
      { key: "last", label: "Last name", required: () => false },
    ],
    build: (v) =>
      vcard({
        firstName: v.first,
        lastName: v.last,
        organization: v.org,
        title: v.title,
        phone: v.phone,
        mobile: v.mobile,
        email: v.email,
        website: v.website,
        street: v.street,
        city: v.city,
        region: v.region,
        postalCode: v.zip,
        country: v.country,
        note: v.note,
      }),
    type: "vcard",
    examples: ['qrforge vcard --first Ada --last Lovelace --org "Analytical Engines" --email ada@example.com -o ada.svg'],
  },
  email: {
    summary: "Pre-filled email (mailto:)",
    usage: "qrforge email --to <address> [--subject <s>] [--body <b>] [options]",
    options: {
      to: { type: "string", description: "Recipient address" },
      subject: { type: "string", description: "Subject" },
      body: { type: "string", description: "Message body" },
      cc: { type: "string", description: "CC address" },
      bcc: { type: "string", description: "BCC address" },
    },
    fields: [{ key: "to", label: "Recipient email", required: () => true }],
    build: (v) => email({ to: v.to, subject: v.subject, body: v.body, cc: v.cc, bcc: v.bcc }),
    type: "email",
    examples: ['qrforge email --to hello@example.com --subject "Hi" --body "I scanned your poster"'],
  },
  sms: {
    summary: "Pre-filled text message",
    usage: "qrforge sms --phone <number> [--message <text>] [options]",
    options: {
      phone: { type: "string", description: "Phone number" },
      message: { type: "string", description: "Message text" },
    },
    fields: [{ key: "phone", label: "Phone number", required: () => true }],
    build: (v) => sms({ phone: v.phone, message: v.message }),
    type: "sms",
    examples: ['qrforge sms --phone +15551234567 --message "JOIN"'],
  },
  phone: {
    summary: "Phone call (tel:)",
    usage: "qrforge phone <number> [options]",
    positional: "number",
    options: { number: { type: "string", description: "Phone number" } },
    fields: [{ key: "number", label: "Phone number", required: () => true }],
    build: (v) => phone(v.number),
    type: "phone",
    examples: ["qrforge phone +15551234567"],
  },
  location: {
    summary: "Map location from coordinates or an address",
    usage: "qrforge location (--lat <lat> --lng <lng> | --address <address>) [--map geo|osm|google|apple] [options]",
    options: {
      lat: { type: "string", description: "Latitude" },
      lng: { type: "string", description: "Longitude" },
      address: { type: "string", description: "Address or place name" },
      map: { type: "string", description: "Payload format: geo (default), osm, google, apple" },
    },
    fields: [
      {
        key: "address",
        label: "Address",
        flag: "--lat and --lng, or --address",
        required: (v) => !has(v.address) && !has(v.lat) && !has(v.lng),
      },
    ],
    build: (v) =>
      location({ latitude: v.lat, longitude: v.lng, address: v.address, format: v.map ?? "geo" }),
    type: "location",
    examples: [
      "qrforge location --lat 48.8584 --lng 2.2945",
      'qrforge location --address "Eiffel Tower, Paris" --map osm',
    ],
  },
  calendar: {
    summary: "Calendar event (iCalendar VEVENT)",
    usage: "qrforge calendar --title <title> --start <date> [--end <date>] [options]",
    aliases: ["event"],
    options: {
      title: { type: "string", description: "Event title" },
      start: { type: "string", description: "Start (ISO 8601, e.g. 2026-05-01T18:00:00Z)" },
      end: { type: "string", description: "End (ISO 8601)" },
      "all-day": { type: "boolean", description: "All-day event (dates as YYYY-MM-DD)" },
      location: { type: "string", description: "Location" },
      description: { type: "string", description: "Description" },
    },
    fields: [
      { key: "title", label: "Event title", required: () => true },
      { key: "start", label: "Start (e.g. 2026-05-01T18:00)", required: () => true },
    ],
    build: (v) =>
      calendar({
        title: v.title,
        start: v.start,
        end: v.end,
        allDay: v["all-day"],
        location: v.location,
        description: v.description,
      }),
    type: "calendar",
    examples: ['qrforge event --title "Launch party" --start 2026-05-01T18:00:00Z --end 2026-05-01T21:00:00Z -o launch.pdf'],
  },
};

export const ALIASES = Object.fromEntries(
  Object.entries(COMMANDS).flatMap(([name, def]) => (def.aliases ?? []).map((a) => [a, name])),
);

export function resolveCommand(name) {
  if (COMMANDS[name]) return name;
  return ALIASES[name] ?? null;
}

/** Shared output and styling options available on every command. */
export const SHARED_OPTIONS = {
  format: { type: "string", description: "Output format: svg, png or pdf (inferred from --output)" },
  output: { type: "string", short: "o", description: "Output file, or - for stdout" },
  terminal: { type: "boolean", short: "t", description: "Print the code in the terminal" },
  size: { type: "string", description: "Width in pixels (default 512)" },
  margin: { type: "string", description: "Quiet zone in modules (default 4)" },
  ecc: { type: "string", description: "Error correction: L, M (default), Q, H" },
  fg: { type: "string", description: "Foreground colour, e.g. #111827" },
  bg: { type: "string", description: "Background colour, e.g. #ffffff" },
  transparent: { type: "boolean", description: "Transparent background" },
  style: { type: "string", description: "Module style: square, rounded, soft, dots" },
  corner: { type: "string", description: "Corner (finder) style: square, rounded, circle" },
  "corner-dot": { type: "string", description: "Corner centre style: square, rounded, circle" },
  "corner-color": { type: "string", description: "Corner colour" },
  logo: { type: "string", description: "Logo image file (PNG for png/pdf; any image for svg)" },
  "logo-size": { type: "string", description: "Logo size as a fraction of the width (0.05–0.35)" },
  label: { type: "string", description: "Text label under the code" },
  frame: { type: "string", description: "Frame: none, box, banner" },
  "frame-color": { type: "string", description: "Frame colour" },
  preset: { type: "string", description: "Design preset (minimal, business, modern, rounded, dark, elegant)" },
  "page-size": { type: "string", description: "PDF page size: fit (default), A4, Letter, A5" },
  help: { type: "boolean", short: "h", description: "Show help" },
};
