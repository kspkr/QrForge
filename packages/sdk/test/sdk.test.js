import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { QRForge, QRForgeAPIError } from "../src/index.js";

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, json, headers = {} } = (await handler(url, init, calls.length)) ?? {};
    const text = json === undefined ? "" : JSON.stringify(json);
    return new Response(status === 204 ? null : text, { status, headers });
  };
  fn.calls = calls;
  return fn;
}

test("validates and normalises baseUrl", () => {
  const f = mockFetch(() => ({}));
  assert.equal(new QRForge({ baseUrl: "https://qr.example.com/", fetch: f }).baseUrl, "https://qr.example.com");
  assert.equal(new QRForge({ baseUrl: "https://qr.example.com/api/v1/", fetch: f }).baseUrl, "https://qr.example.com");
  assert.equal(new QRForge({ baseUrl: "http://localhost:8080/qr", fetch: f }).baseUrl, "http://localhost:8080/qr");
  assert.throws(() => new QRForge({ fetch: f }), /baseUrl` is required/);
  assert.throws(() => new QRForge({ baseUrl: "not a url", fetch: f }), /invalid baseUrl/);
  assert.throws(() => new QRForge({ baseUrl: "ftp://x.com", fetch: f }), /http or https/);
  assert.throws(() => new QRForge({ baseUrl: "https://x.com/?a=1", fetch: f }), /query string/);
});

test("sends the API key, JSON body and returns parsed data", async () => {
  const f = mockFetch(() => ({ status: 201, json: { id: "qr_1", slug: "abc123", redirect_url: "https://qr.example.com/r/abc123" } }));
  const client = new QRForge({ baseUrl: "https://qr.example.com", apiKey: "qrf_secret", fetch: f });
  const qr = await client.qrcodes.create({ name: "Website", kind: "dynamic", destination: "https://example.com" });
  assert.equal(qr.slug, "abc123");
  const [call] = f.calls;
  assert.equal(call.url, "https://qr.example.com/api/v1/qrcodes");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, "Bearer qrf_secret");
  assert.equal(call.init.headers["Content-Type"], "application/json");
  assert.deepEqual(call.body, { name: "Website", kind: "dynamic", destination: "https://example.com" });
});

test("maps every resource method to the documented endpoint", async () => {
  const f = mockFetch((url, init) => (init.method === "DELETE" ? { status: 204 } : { json: { ok: true } }));
  const c = new QRForge({ baseUrl: "https://h.io", apiKey: "k", fetch: f });
  await c.qrcodes.list({ page: 2, per_page: 10, kind: "dynamic", q: "menu & more", campaign_id: undefined });
  await c.qrcodes.get("qr_1");
  await c.qrcodes.update("qr_1", { destination: "https://new.example" });
  assert.equal(await c.qrcodes.delete("qr_1"), null);
  await c.qrcodes.analytics("qr_1", { range: "7d" });
  await c.qrcodes.rotateSlug("qr_1");
  await c.qrcodes.duplicate("qr_1");
  await c.qrcodes.history("qr_1");
  await c.campaigns.create({ name: "Summer" });
  await c.campaigns.list();
  await c.campaigns.get("cmp_1");
  await c.campaigns.update("cmp_1", { name: "Winter" });
  await c.campaigns.delete("cmp_1");
  await c.campaigns.analytics("cmp_1", { range: "30d" });
  await c.analytics.overview({ range: "all" });
  await c.domains.list();
  await c.health();
  await c.config();
  const got = f.calls.map((x) => `${x.init.method} ${x.url.replace("https://h.io/api/v1", "")}`);
  assert.deepEqual(got, [
    "GET /qrcodes?page=2&per_page=10&kind=dynamic&q=menu+%26+more",
    "GET /qrcodes/qr_1",
    "PATCH /qrcodes/qr_1",
    "DELETE /qrcodes/qr_1",
    "GET /qrcodes/qr_1/analytics?range=7d",
    "POST /qrcodes/qr_1/rotate-slug",
    "POST /qrcodes/qr_1/duplicate",
    "GET /qrcodes/qr_1/history",
    "POST /campaigns",
    "GET /campaigns",
    "GET /campaigns/cmp_1",
    "PATCH /campaigns/cmp_1",
    "DELETE /campaigns/cmp_1",
    "GET /campaigns/cmp_1/analytics?range=30d",
    "GET /analytics/overview?range=all",
    "GET /domains",
    "GET /health",
    "GET /config",
  ]);
});

test("ids are URL-encoded", async () => {
  const f = mockFetch(() => ({ json: {} }));
  await new QRForge({ baseUrl: "https://h.io", fetch: f }).qrcodes.get("../admin");
  assert.equal(f.calls[0].url, "https://h.io/api/v1/qrcodes/..%2Fadmin");
});

test("listAll iterates over every page", async () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `qr_${i}` }));
  const f = mockFetch((url) => {
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    const per = Number(u.searchParams.get("per_page"));
    return { json: { data: items.slice((page - 1) * per, page * per), pagination: { page, per_page: per, total: items.length } } };
  });
  const c = new QRForge({ baseUrl: "https://h.io", fetch: f });
  const seen = [];
  for await (const qr of c.qrcodes.listAll({ per_page: 2, kind: "dynamic" })) seen.push(qr.id);
  assert.deepEqual(seen, ["qr_0", "qr_1", "qr_2", "qr_3", "qr_4"]);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((x) => x.url.includes("kind=dynamic")));
});

test("maps API errors to QRForgeAPIError", async () => {
  const f = mockFetch(() => ({
    status: 422,
    json: { error: { code: "validation_failed", message: "Invalid input", fields: { destination: "must be an http(s) URL" } } },
  }));
  const c = new QRForge({ baseUrl: "https://h.io", fetch: f });
  await assert.rejects(c.qrcodes.create({ name: "x" }), (e) => {
    assert.ok(e instanceof QRForgeAPIError);
    assert.equal(e.status, 422);
    assert.equal(e.code, "validation_failed");
    assert.equal(e.message, "Invalid input");
    assert.deepEqual(e.fields, { destination: "must be an http(s) URL" });
    return true;
  });
});

test("rate limiting exposes retryAfter", async () => {
  const f = mockFetch(() => ({
    status: 429,
    headers: { "Retry-After": "42" },
    json: { error: { code: "rate_limited", message: "Too many requests" } },
  }));
  await assert.rejects(new QRForge({ baseUrl: "https://h.io", fetch: f }).health(), (e) => e.code === "rate_limited" && e.retryAfter === 42);
});

test("non-JSON error bodies still produce a useful error", async () => {
  const f = async () => new Response("<html>Bad gateway</html>", { status: 502 });
  await assert.rejects(new QRForge({ baseUrl: "https://h.io", fetch: f }).health(), (e) => e.status === 502 && e.code === "internal");
});

test("network errors and timeouts", async () => {
  const failing = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(new QRForge({ baseUrl: "https://h.io", fetch: failing }).health(), (e) => e.code === "network_error" && e.status === 0);

  const hanging = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  await assert.rejects(
    new QRForge({ baseUrl: "https://h.io", fetch: hanging, timeoutMs: 20 }).health(),
    (e) => e.code === "timeout" && /timed out after 20 ms/.test(e.message),
  );
});

test("works against a real HTTP server", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/v1/qrcodes/missing") {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { code: "not_found", message: "QR code not found" } }));
        return;
      }
      res.end(JSON.stringify({ id: "qr_123", slug: "abc123", redirect_url: "http://localhost/r/abc123", name: JSON.parse(body || "{}").name }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const client = new QRForge({ baseUrl: `http://127.0.0.1:${port}`, apiKey: "qrf_live" });
    const qr = await client.qrcodes.create({ name: "Website", type: "dynamic", destination: "https://example.com" });
    assert.equal(qr.id, "qr_123");
    assert.equal(qr.name, "Website");
    assert.equal(requests[0].auth, "Bearer qrf_live");
    assert.equal(requests[0].method, "POST");
    await assert.rejects(client.qrcodes.get("missing"), (e) => e.status === 404 && e.code === "not_found");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
