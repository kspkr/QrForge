import { test } from "node:test";
import assert from "node:assert/strict";
import {
  url,
  text,
  wifi,
  vcard,
  email,
  sms,
  phone,
  location,
  calendar,
  buildPayload,
  QR_TYPES,
} from "../src/index.js";

const fails = (fn, field) =>
  assert.throws(fn, (e) => e.code === "INVALID_PAYLOAD" && (field === undefined || e.details?.field === field));

test("url adds https:// and rejects other schemes", () => {
  assert.equal(url("example.com"), "https://example.com");
  assert.equal(url("http://example.com/a?b=c"), "http://example.com/a?b=c");
  assert.equal(url({ url: "  example.com/x " }), "https://example.com/x");
  fails(() => url("javascript:alert(1)"), "url");
  fails(() => url("not a url"), "url");
  fails(() => url(""), "url");
});

test("text keeps content verbatim", () => {
  assert.equal(text("hello\nworld"), "hello\nworld");
  fails(() => text("   "), "text");
});

test("wifi escapes special characters", () => {
  assert.equal(wifi({ ssid: "Home", password: "secret" }), "WIFI:T:WPA;S:Home;P:secret;;");
  assert.equal(
    wifi({ ssid: 'My;Net,"x":\\', password: "p;w", encryption: "WEP", hidden: true }),
    'WIFI:T:WEP;S:My\\;Net\\,\\"x\\"\\:\\\\;P:p\\;w;H:true;;',
  );
  assert.equal(wifi({ ssid: "Open", encryption: "nopass" }), "WIFI:T:nopass;S:Open;;");
  fails(() => wifi({ ssid: "" }), "ssid");
  fails(() => wifi({ ssid: "x", encryption: "WPA" }), "password");
  fails(() => wifi({ ssid: "x", encryption: "ROT13", password: "a" }), "encryption");
});

test("vcard builds a vCard 3.0 with escaping", () => {
  const card = vcard({
    firstName: "Ada",
    lastName: "Lovelace",
    organization: "Analytical Engines, Ltd",
    title: "Engineer",
    phone: "+44 (20) 1234-5678",
    email: "ada@example.com",
    website: "example.com",
    street: "1 Main St",
    city: "London",
    postalCode: "N1",
    country: "UK",
  });
  const lines = card.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCARD");
  assert.ok(lines.includes("N:Lovelace;Ada;;;"));
  assert.ok(lines.includes("FN:Ada Lovelace"));
  assert.ok(lines.includes("ORG:Analytical Engines\\, Ltd"));
  assert.ok(lines.includes("TEL;TYPE=WORK,VOICE:+442012345678"));
  assert.ok(lines.includes("EMAIL;TYPE=INTERNET:ada@example.com"));
  assert.ok(lines.includes("URL:https://example.com"));
  assert.ok(lines.includes("ADR;TYPE=WORK:;;1 Main St;London;;N1;UK"));
  assert.equal(lines.at(-1), "END:VCARD");
  assert.ok(vcard({ organization: "Acme" }).includes("FN:Acme"));
  fails(() => vcard({}), "firstName");
  fails(() => vcard({ firstName: "A", email: "nope" }), "email");
});

test("email builds mailto: with encoded params", () => {
  assert.equal(email({ to: "a@b.co" }), "mailto:a@b.co");
  assert.equal(
    email({ to: "a@b.co", subject: "Hi there", body: "a&b" }),
    "mailto:a@b.co?subject=Hi%20there&body=a%26b",
  );
  fails(() => email({ to: "bad" }), "to");
});

test("sms and phone normalise numbers", () => {
  assert.equal(sms({ phone: "+1 555 123 4567", message: "Hello" }), "SMSTO:+15551234567:Hello");
  assert.equal(sms({ phone: "555" }), "SMSTO:555");
  assert.equal(phone("+1 (555) 000-1111"), "tel:+15550001111");
  fails(() => phone("call me"), "phone");
});

test("location supports coordinates, addresses and link formats", () => {
  assert.equal(location({ latitude: 51.5007292, longitude: -0.1246254 }), "geo:51.500729,-0.124625");
  assert.equal(
    location({ latitude: "10", longitude: "20", format: "osm" }),
    "https://www.openstreetmap.org/?mlat=10&mlon=20#map=16/10/20",
  );
  assert.equal(location({ address: "10 Downing St" }), "geo:0,0?q=10%20Downing%20St");
  assert.match(location({ address: "Paris", format: "google" }), /^https:\/\/www\.google\.com\/maps/);
  fails(() => location({ latitude: 91, longitude: 0 }), "latitude");
  fails(() => location({}), "address");
});

test("calendar builds a VEVENT in UTC", () => {
  const ev = calendar({
    title: "Launch; party",
    start: "2026-05-01T18:00:00Z",
    end: "2026-05-01T20:30:00Z",
    location: "HQ",
    description: "Line 1\nLine 2",
  });
  assert.equal(
    ev,
    [
      "BEGIN:VEVENT",
      "SUMMARY:Launch\\; party",
      "DTSTART:20260501T180000Z",
      "DTEND:20260501T203000Z",
      "LOCATION:HQ",
      "DESCRIPTION:Line 1\\nLine 2",
      "END:VEVENT",
    ].join("\r\n"),
  );
  assert.ok(calendar({ title: "Day", start: "2026-05-01", allDay: true }).includes("DTSTART;VALUE=DATE:20260501"));
  fails(() => calendar({ title: "x", start: "2026-05-02T00:00:00Z", end: "2026-05-01T00:00:00Z" }), "end");
  fails(() => calendar({ title: "x", start: "someday" }), "start");
});

test("buildPayload dispatches by type", () => {
  assert.deepEqual(QR_TYPES, ["url", "text", "wifi", "vcard", "email", "sms", "phone", "location", "calendar"]);
  assert.equal(buildPayload("phone", { phone: "123" }), "tel:123");
  assert.throws(() => buildPayload("nope", {}), (e) => e.code === "INVALID_OPTION");
});
