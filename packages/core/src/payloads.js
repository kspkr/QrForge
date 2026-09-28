/**
 * Builders that turn structured input into standard QR payload strings.
 * Every builder validates its input and throws a QRForgeError on bad data.
 */

import { QRForgeError } from "./errors.js";

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const str = (v) => (v === undefined || v === null ? "" : String(v));

function require(value, field) {
  if (isBlank(value)) throw new QRForgeError("INVALID_PAYLOAD", `"${field}" is required.`, { field });
  return String(value).trim();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9 ()./-]{3,32}$/;

function validatePhone(phone, field = "phone") {
  const value = require(phone, field);
  if (!PHONE_REGEX.test(value)) {
    throw new QRForgeError("INVALID_PAYLOAD", `"${field}" is not a valid phone number.`, { field });
  }
  // Keep a leading + and digits only; separators confuse some dialers.
  return (value.startsWith("+") ? "+" : "") + value.replace(/[^0-9]/g, "");
}

function validateEmail(email, field = "email") {
  const value = require(email, field);
  if (!EMAIL_REGEX.test(value)) {
    throw new QRForgeError("INVALID_PAYLOAD", `"${field}" is not a valid email address.`, { field });
  }
  return value;
}

/**
 * URL payload. Adds https:// when no scheme is given.
 * Only http(s) URLs are accepted, which keeps generated codes predictable.
 */
export function url(input) {
  const raw = require(typeof input === "object" && input !== null ? input.url : input, "url");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new QRForgeError("INVALID_PAYLOAD", `"${raw}" is not a valid URL.`, { field: "url" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new QRForgeError("INVALID_PAYLOAD", "Only http:// and https:// URLs are supported.", { field: "url" });
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    throw new QRForgeError("INVALID_PAYLOAD", `"${raw}" is not a valid URL.`, { field: "url" });
  }
  // Preserve exactly what the user typed (after the optional scheme) rather
  // than URL.href, which may re-encode or add a trailing slash.
  return withScheme;
}

/** Plain text payload. */
export function text(input) {
  const value = typeof input === "object" && input !== null ? input.text : input;
  if (isBlank(value)) throw new QRForgeError("INVALID_PAYLOAD", '"text" is required.', { field: "text" });
  return String(value);
}

function escapeWifi(value) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Wi-Fi network payload (the de-facto `WIFI:` format understood by iOS and Android).
 * @param {{ssid:string,password?:string,encryption?:"WPA"|"WEP"|"nopass",hidden?:boolean}} input
 */
export function wifi(input = {}) {
  const ssid = str(input.ssid);
  if (ssid.length === 0) throw new QRForgeError("INVALID_PAYLOAD", '"ssid" is required.', { field: "ssid" });
  const encryption = (input.encryption ?? "WPA").toString();
  const normalized = encryption.toUpperCase() === "NOPASS" || encryption === "none" ? "nopass" : encryption.toUpperCase();
  if (!["WPA", "WEP", "nopass"].includes(normalized)) {
    throw new QRForgeError("INVALID_PAYLOAD", 'encryption must be "WPA", "WEP" or "nopass".', { field: "encryption" });
  }
  const password = str(input.password);
  if (normalized !== "nopass" && password.length === 0) {
    throw new QRForgeError("INVALID_PAYLOAD", '"password" is required for secured networks.', { field: "password" });
  }
  let out = `WIFI:T:${normalized};S:${escapeWifi(ssid)};`;
  if (normalized !== "nopass") out += `P:${escapeWifi(password)};`;
  if (input.hidden) out += "H:true;";
  return `${out};`;
}

function escapeVcard(value) {
  return str(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/**
 * Contact card payload (vCard 3.0).
 * @param {{firstName?:string,lastName?:string,organization?:string,title?:string,phone?:string,
 *   mobile?:string,email?:string,website?:string,street?:string,city?:string,region?:string,
 *   postalCode?:string,country?:string,note?:string}} input
 */
export function vcard(input = {}) {
  const first = str(input.firstName).trim();
  const last = str(input.lastName).trim();
  const org = str(input.organization).trim();
  if (!first && !last && !org) {
    throw new QRForgeError("INVALID_PAYLOAD", "A contact needs at least a name or an organization.", {
      field: "firstName",
    });
  }
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${escapeVcard(last)};${escapeVcard(first)};;;`);
  lines.push(`FN:${escapeVcard([first, last].filter(Boolean).join(" ") || org)}`);
  if (org) lines.push(`ORG:${escapeVcard(org)}`);
  if (!isBlank(input.title)) lines.push(`TITLE:${escapeVcard(input.title)}`);
  if (!isBlank(input.phone)) lines.push(`TEL;TYPE=WORK,VOICE:${validatePhone(input.phone)}`);
  if (!isBlank(input.mobile)) lines.push(`TEL;TYPE=CELL:${validatePhone(input.mobile, "mobile")}`);
  if (!isBlank(input.email)) lines.push(`EMAIL;TYPE=INTERNET:${validateEmail(input.email)}`);
  if (!isBlank(input.website)) lines.push(`URL:${escapeVcard(url(input.website))}`);
  const address = [input.street, input.city, input.region, input.postalCode, input.country];
  if (address.some((p) => !isBlank(p))) {
    lines.push(`ADR;TYPE=WORK:;;${address.map((p) => escapeVcard(str(p).trim())).join(";")}`);
  }
  if (!isBlank(input.note)) lines.push(`NOTE:${escapeVcard(input.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/**
 * Email payload (`mailto:` URI).
 * @param {{to:string,subject?:string,body?:string,cc?:string,bcc?:string}} input
 */
export function email(input = {}) {
  const to = validateEmail(input.to ?? input.address, "to");
  const params = [];
  for (const key of ["cc", "bcc"]) {
    if (!isBlank(input[key])) params.push(`${key}=${encodeURIComponent(validateEmail(input[key], key))}`);
  }
  if (!isBlank(input.subject)) params.push(`subject=${encodeURIComponent(input.subject)}`);
  if (!isBlank(input.body)) params.push(`body=${encodeURIComponent(input.body)}`);
  return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
}

/**
 * SMS payload (`SMSTO:` format, supported by iOS and Android camera apps).
 * @param {{phone:string,message?:string}} input
 */
export function sms(input = {}) {
  const phone = validatePhone(input.phone);
  const message = str(input.message);
  return message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}`;
}

/** Phone call payload (`tel:` URI). */
export function phone(input) {
  const value = typeof input === "object" && input !== null ? input.phone : input;
  return `tel:${validatePhone(value)}`;
}

function parseCoordinate(value, field, limit) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (isBlank(value) || !Number.isFinite(n) || Math.abs(n) > limit) {
    throw new QRForgeError("INVALID_PAYLOAD", `"${field}" must be a number between -${limit} and ${limit}.`, { field });
  }
  // Round to ~11 cm precision and trim trailing zeros for compact payloads.
  return String(Number(n.toFixed(6)));
}

/**
 * Location payload.
 * Provide either latitude/longitude or a free-form address (query).
 * `format`: "geo" (default, `geo:` URI), "osm" (OpenStreetMap link) or "google" (Google Maps link).
 */
export function location(input = {}) {
  const format = input.format ?? "geo";
  if (!["geo", "osm", "google", "apple"].includes(format)) {
    throw new QRForgeError("INVALID_PAYLOAD", 'format must be "geo", "osm", "google" or "apple".', { field: "format" });
  }
  const hasCoords = !isBlank(input.latitude) || !isBlank(input.longitude);
  if (hasCoords) {
    const lat = parseCoordinate(input.latitude, "latitude", 90);
    const lng = parseCoordinate(input.longitude, "longitude", 180);
    switch (format) {
      case "osm":
        return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
      case "google":
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      case "apple":
        return `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
      default:
        return `geo:${lat},${lng}`;
    }
  }
  const query = require(input.address ?? input.query, "address");
  const q = encodeURIComponent(query);
  switch (format) {
    case "osm":
      return `https://www.openstreetmap.org/search?query=${q}`;
    case "google":
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
    case "apple":
      return `https://maps.apple.com/?q=${q}`;
    default:
      return `geo:0,0?q=${q}`;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDate(value, field) {
  const d = value instanceof Date ? value : new Date(value);
  if (isBlank(value) || Number.isNaN(d.getTime())) {
    throw new QRForgeError("INVALID_PAYLOAD", `"${field}" must be a valid date.`, { field });
  }
  return d;
}

function icsDateTime(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function icsDate(value, field) {
  // All-day dates are calendar dates, not instants: accept "YYYY-MM-DD" verbatim.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, "");
  const d = toDate(value, field);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function escapeIcs(value) {
  return str(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/**
 * Calendar event payload (iCalendar VEVENT).
 * @param {{title:string,start:Date|string,end?:Date|string,allDay?:boolean,location?:string,description?:string}} input
 */
export function calendar(input = {}) {
  const title = require(input.title ?? input.summary, "title");
  const lines = ["BEGIN:VEVENT", `SUMMARY:${escapeIcs(title)}`];
  if (input.allDay) {
    const start = icsDate(input.start, "start");
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    if (!isBlank(input.end)) {
      const end = icsDate(input.end, "end");
      if (end < start) throw new QRForgeError("INVALID_PAYLOAD", '"end" must be after "start".', { field: "end" });
      lines.push(`DTEND;VALUE=DATE:${end}`);
    }
  } else {
    const start = toDate(input.start, "start");
    lines.push(`DTSTART:${icsDateTime(start)}`);
    if (!isBlank(input.end)) {
      const end = toDate(input.end, "end");
      if (end < start) throw new QRForgeError("INVALID_PAYLOAD", '"end" must be after "start".', { field: "end" });
      lines.push(`DTEND:${icsDateTime(end)}`);
    }
  }
  if (!isBlank(input.location)) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (!isBlank(input.description)) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

/** All payload builders keyed by QR type. */
export const payloads = Object.freeze({ url, text, wifi, vcard, email, sms, phone, location, calendar });

/** Supported structured QR types. */
export const QR_TYPES = Object.freeze(Object.keys(payloads));

/**
 * Build a payload for the given type.
 * @param {string} type - One of QR_TYPES.
 * @param {object|string} input
 */
export function buildPayload(type, input) {
  const builder = payloads[type];
  if (!builder) {
    throw new QRForgeError("INVALID_OPTION", `Unknown QR type "${type}". Expected one of: ${QR_TYPES.join(", ")}.`);
  }
  return builder(input);
}
