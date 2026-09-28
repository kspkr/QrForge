import { Link2, Type, Wifi, Contact, Mail, MessageSquare, Phone, MapPin, CalendarDays } from "lucide-react";
import { buildPayload } from "@qrforge/core";

/**
 * Structured QR types shown in the Studio.
 * Each field: { name, label, type, placeholder, required, optional, span, options, hint }
 */
export const QR_TYPE_DEFS = [
  {
    id: "url",
    label: "URL",
    icon: Link2,
    description: "Open a website",
    defaults: { url: "https://example.com" },
    fields: [{ name: "url", label: "Website URL", type: "url", placeholder: "https://example.com", required: true, span: 2 }],
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
    description: "Show plain text",
    defaults: { text: "" },
    fields: [{ name: "text", label: "Text", type: "textarea", placeholder: "Any text you like…", required: true, span: 2, rows: 5 }],
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    icon: Wifi,
    description: "Join a network",
    defaults: { ssid: "", password: "", encryption: "WPA", hidden: false },
    fields: [
      { name: "ssid", label: "Network name (SSID)", placeholder: "My Network", required: true, autoComplete: "off" },
      {
        name: "encryption",
        label: "Security",
        type: "select",
        options: [
          { value: "WPA", label: "WPA / WPA2 / WPA3" },
          { value: "WEP", label: "WEP (legacy)" },
          { value: "nopass", label: "None (open network)" },
        ],
      },
      { name: "password", label: "Password", type: "password", required: true, span: 2, hideWhen: (v) => v.encryption === "nopass" },
      { name: "hidden", label: "Hidden network", type: "switch", description: "The network doesn't broadcast its name.", span: 2 },
    ],
  },
  {
    id: "vcard",
    label: "Contact",
    icon: Contact,
    description: "Save a vCard",
    defaults: {},
    fields: [
      { name: "firstName", label: "First name", autoComplete: "given-name" },
      { name: "lastName", label: "Last name", autoComplete: "family-name" },
      { name: "organization", label: "Organization", autoComplete: "organization", optional: true },
      { name: "title", label: "Job title", autoComplete: "organization-title", optional: true },
      { name: "phone", label: "Phone", type: "tel", autoComplete: "tel", optional: true },
      { name: "mobile", label: "Mobile", type: "tel", optional: true },
      { name: "email", label: "Email", type: "email", autoComplete: "email", optional: true },
      { name: "website", label: "Website", type: "url", optional: true },
      { name: "street", label: "Street", autoComplete: "street-address", optional: true, span: 2 },
      { name: "city", label: "City", autoComplete: "address-level2", optional: true },
      { name: "region", label: "State / region", autoComplete: "address-level1", optional: true },
      { name: "postalCode", label: "Postal code", autoComplete: "postal-code", optional: true },
      { name: "country", label: "Country", autoComplete: "country-name", optional: true },
    ],
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    description: "Compose an email",
    defaults: {},
    fields: [
      { name: "to", label: "To", type: "email", placeholder: "hello@example.com", required: true, span: 2 },
      { name: "subject", label: "Subject", optional: true, span: 2 },
      { name: "body", label: "Message", type: "textarea", optional: true, span: 2 },
    ],
  },
  {
    id: "sms",
    label: "SMS",
    icon: MessageSquare,
    description: "Send a text",
    defaults: {},
    fields: [
      { name: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567", required: true, span: 2 },
      { name: "message", label: "Message", type: "textarea", optional: true, span: 2 },
    ],
  },
  {
    id: "phone",
    label: "Phone",
    icon: Phone,
    description: "Start a call",
    defaults: {},
    fields: [{ name: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567", required: true, span: 2 }],
  },
  {
    id: "location",
    label: "Location",
    icon: MapPin,
    description: "Open a map",
    defaults: { mode: "coords", format: "geo" },
    fields: [
      {
        name: "mode",
        type: "segmented",
        label: "Specify by",
        span: 2,
        options: [
          { value: "coords", label: "Coordinates" },
          { value: "address", label: "Address" },
        ],
      },
      { name: "latitude", label: "Latitude", placeholder: "51.5007", inputMode: "decimal", required: true, hideWhen: (v) => v.mode === "address" },
      { name: "longitude", label: "Longitude", placeholder: "-0.1246", inputMode: "decimal", required: true, hideWhen: (v) => v.mode === "address" },
      { name: "address", label: "Address or place", placeholder: "Brandenburg Gate, Berlin", required: true, span: 2, hideWhen: (v) => v.mode !== "address" },
      {
        name: "format",
        label: "Open with",
        type: "select",
        span: 2,
        options: [
          { value: "geo", label: "Default maps app (geo: URI)" },
          { value: "osm", label: "OpenStreetMap link" },
          { value: "google", label: "Google Maps link" },
          { value: "apple", label: "Apple Maps link" },
        ],
        hint: "geo: works on Android; map links work on every phone.",
      },
    ],
  },
  {
    id: "calendar",
    label: "Event",
    icon: CalendarDays,
    description: "Add to calendar",
    defaults: { allDay: false },
    fields: [
      { name: "title", label: "Event title", required: true, span: 2 },
      { name: "allDay", label: "All-day event", type: "switch", span: 2 },
      { name: "start", label: "Starts", type: "datetime-local", required: true, dateWhen: (v) => v.allDay },
      { name: "end", label: "Ends", type: "datetime-local", optional: true, dateWhen: (v) => v.allDay },
      { name: "location", label: "Location", optional: true, span: 2 },
      { name: "description", label: "Description", type: "textarea", optional: true, span: 2 },
    ],
  },
];

export const QR_TYPE_MAP = Object.fromEntries(QR_TYPE_DEFS.map((t) => [t.id, t]));

/** Convert Studio form values to the input expected by @qrforge/core's payload builders. */
function toBuilderInput(type, values) {
  switch (type) {
    case "location":
      return values.mode === "address"
        ? { address: values.address, format: values.format }
        : { latitude: values.latitude, longitude: values.longitude, format: values.format };
    case "calendar":
      return {
        ...values,
        // datetime-local values are local wall-clock times; Date() interprets them as local.
        start: values.allDay ? values.start : values.start ? new Date(values.start) : "",
        end: values.allDay ? values.end : values.end ? new Date(values.end) : "",
      };
    default:
      return values;
  }
}

/**
 * Build the encoded payload for a type.
 * @returns {{ payload: string|null, error: {field?:string,message:string}|null }}
 */
export function buildStudioPayload(type, values) {
  try {
    return { payload: buildPayload(type, toBuilderInput(type, values)), error: null };
  } catch (e) {
    return { payload: null, error: { field: e.details?.field, message: e.message } };
  }
}
