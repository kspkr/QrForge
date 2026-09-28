import { describe, it, expect } from "vitest";
import { buildStudioPayload, QR_TYPE_DEFS } from "../src/lib/qrTypes.js";
import { applyPreset, designToOptions, DEFAULT_DESIGN, normalizeDesign } from "../src/lib/design.js";
import { codeFormToBody, initialCodeForm } from "../src/components/CodeForm.jsx";

describe("buildStudioPayload", () => {
  it("builds payloads for every type from its defaults plus required fields", () => {
    const filled = {
      url: { url: "example.com" },
      text: { text: "hello" },
      wifi: { ssid: "Cafe", password: "latte", encryption: "WPA" },
      vcard: { firstName: "Ada" },
      email: { to: "a@b.co" },
      sms: { phone: "+1 555" },
      phone: { phone: "123" },
      location: { mode: "coords", latitude: "1", longitude: "2", format: "geo" },
      calendar: { title: "Launch", start: "2026-05-01", allDay: true },
    };
    for (const def of QR_TYPE_DEFS) {
      const { payload, error } = buildStudioPayload(def.id, { ...def.defaults, ...filled[def.id] });
      expect(error, def.id).toBeNull();
      expect(payload, def.id).toBeTruthy();
    }
  });

  it("reports the invalid field", () => {
    expect(buildStudioPayload("wifi", { ssid: "x", encryption: "WPA" }).error.field).toBe("password");
    expect(buildStudioPayload("url", { url: "javascript:alert(1)" }).error.field).toBe("url");
  });

  it("uses address mode for locations", () => {
    expect(buildStudioPayload("location", { mode: "address", address: "Paris", format: "osm" }).payload).toBe(
      "https://www.openstreetmap.org/search?query=Paris",
    );
  });

  it("converts local datetimes to UTC for events", () => {
    const { payload } = buildStudioPayload("calendar", { title: "x", start: "2026-05-01T10:00", allDay: false });
    const expected = new Date("2026-05-01T10:00").toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    expect(payload).toContain(`DTSTART:${expected}`);
  });
});

describe("design", () => {
  it("maps the default design to scan-safe core options", () => {
    expect(designToOptions(DEFAULT_DESIGN)).toMatchObject({
      foreground: "#000000",
      background: "#ffffff",
      ecc: "M",
      margin: 4,
      logo: null,
      frame: null,
      label: null,
    });
  });

  it("applies presets and adds a label for framed presets", () => {
    const d = applyPreset(DEFAULT_DESIGN, "dark");
    expect(d.frame).toBe("banner");
    expect(d.label).toBe("SCAN ME");
    expect(designToOptions(d).frame).toEqual({ style: "banner", color: "#0a0a0a" });
  });

  it("handles transparency and logo backgrounds", () => {
    const opts = designToOptions({
      ...DEFAULT_DESIGN,
      transparent: true,
      logo: { src: "data:image/png;base64,AA", size: 0.2, padding: 1, background: true, bgColor: "" },
    });
    expect(opts.background).toBe("transparent");
    expect(opts.logo.background).toBe("#ffffff");
  });

  it("normalizes bad input", () => {
    expect(normalizeDesign(null)).toEqual(DEFAULT_DESIGN);
    expect(normalizeDesign({ logo: { src: 42 } }).logo).toBeNull();
  });
});

describe("code form", () => {
  it("only sends set UTM params and omits empty optional fields", () => {
    const form = initialCodeForm({}, { name: " Menu ", destination: " https://example.com ", utm: { source: "flyer", medium: " " } });
    const body = codeFormToBody({ ...form, utm: { ...form.utm, source: "flyer", medium: " " } }, { isNew: true });
    expect(body).toMatchObject({ kind: "dynamic", name: "Menu", destination: "https://example.com", utm: { source: "flyer" } });
    expect(body.slug).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(body.expires_at).toBeNull();
  });

  it("clears passwords explicitly on update", () => {
    const form = { ...initialCodeForm({ has_password: true, destination: "https://x.y", name: "a" }), clearPassword: true };
    expect(codeFormToBody(form).password).toBeNull();
  });
});
