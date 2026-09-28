/**
 * @qrforge/sdk — a small fetch-based client for the QRForge REST API.
 *
 * Works in Node.js 18+, Deno, Bun and modern browsers. No dependencies.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/** Error returned by the API (or raised for network failures and timeouts). */
export class QRForgeAPIError extends Error {
  /**
   * @param {object} init
   * @param {number} init.status   HTTP status (0 for network errors/timeouts)
   * @param {string} init.code     Machine-readable code, e.g. "validation_failed"
   * @param {string} init.message
   * @param {Record<string,string>} [init.fields]
   * @param {number|null} [init.retryAfter] Seconds to wait (rate limiting)
   */
  constructor({ status, code, message, fields, retryAfter = null, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = "QRForgeAPIError";
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
    this.retryAfter = retryAfter;
  }
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new TypeError("QRForge: `baseUrl` is required, e.g. \"https://qr.example.com\".");
  }
  let url;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new TypeError(`QRForge: invalid baseUrl "${baseUrl}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("QRForge: baseUrl must use http or https.");
  }
  if (url.search || url.hash) throw new TypeError("QRForge: baseUrl must not contain a query string or fragment.");
  // Accept both "https://host" and "https://host/api/v1".
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return `${url.origin}${path}`;
}

function buildQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

const enc = encodeURIComponent;

export class QRForge {
  /**
   * @param {object} options
   * @param {string} options.baseUrl   Your QRForge server, e.g. "https://qr.example.com"
   * @param {string} [options.apiKey]  API key ("qrf_...") created in Dashboard → API Keys
   * @param {typeof fetch} [options.fetch] Custom fetch implementation
   * @param {number} [options.timeoutMs=30000]
   * @param {Record<string,string>} [options.headers] Extra headers for every request
   */
  constructor({ baseUrl, apiKey, fetch: fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS, headers } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.headers = headers ?? {};
    this._fetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (typeof this._fetch !== "function") {
      throw new TypeError("QRForge: no fetch implementation available. Pass `fetch` in the options.");
    }

    const q = (id) => `/qrcodes/${enc(id)}`;
    this.qrcodes = {
      create: (body) => this.request("POST", "/qrcodes", { body }),
      list: (params) => this.request("GET", "/qrcodes", { query: params }),
      get: (id) => this.request("GET", q(id)),
      update: (id, body) => this.request("PATCH", q(id), { body }),
      delete: (id) => this.request("DELETE", q(id)),
      analytics: (id, params) => this.request("GET", `${q(id)}/analytics`, { query: params }),
      rotateSlug: (id) => this.request("POST", `${q(id)}/rotate-slug`),
      duplicate: (id) => this.request("POST", `${q(id)}/duplicate`),
      history: (id) => this.request("GET", `${q(id)}/history`),
      listAll: (params) => this.paginate("/qrcodes", params),
    };

    const c = (id) => `/campaigns/${enc(id)}`;
    this.campaigns = {
      create: (body) => this.request("POST", "/campaigns", { body }),
      list: (params) => this.request("GET", "/campaigns", { query: params }),
      get: (id) => this.request("GET", c(id)),
      update: (id, body) => this.request("PATCH", c(id), { body }),
      delete: (id) => this.request("DELETE", c(id)),
      analytics: (id, params) => this.request("GET", `${c(id)}/analytics`, { query: params }),
      listAll: (params) => this.paginate("/campaigns", params),
    };

    this.analytics = {
      overview: (params) => this.request("GET", "/analytics/overview", { query: params }),
    };

    this.domains = {
      list: (params) => this.request("GET", "/domains", { query: params }),
    };
  }

  /** `GET /api/v1/health` */
  health() {
    return this.request("GET", "/health");
  }

  /** `GET /api/v1/config` */
  config() {
    return this.request("GET", "/config");
  }

  /**
   * Iterate over every item of a paginated list endpoint.
   * @returns {AsyncGenerator<object>}
   */
  async *paginate(path, params = {}) {
    const perPage = params.per_page ?? 100;
    let page = params.page ?? 1;
    for (;;) {
      const res = await this.request("GET", path, { query: { ...params, page, per_page: perPage } });
      const items = res?.data ?? [];
      for (const item of items) yield item;
      const total = res?.pagination?.total;
      if (items.length === 0 || items.length < perPage || (typeof total === "number" && page * perPage >= total)) {
        return;
      }
      page++;
    }
  }

  /**
   * Low-level request helper. `path` is relative to `/api/v1`.
   * @returns {Promise<any>} parsed JSON, or null for empty responses
   */
  async request(method, path, { query, body, headers } = {}) {
    const url = `${this.baseUrl}/api/v1${path}${buildQuery(query)}`;
    const init = {
      method,
      headers: { Accept: "application/json", ...this.headers, ...headers },
    };
    if (this.apiKey) init.headers.Authorization = `Bearer ${this.apiKey}`;
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer =
      this.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, this.timeoutMs)
        : null;
    init.signal = controller.signal;

    let response;
    let text;
    try {
      response = await this._fetch(url, init);
      text = await response.text();
    } catch (error) {
      if (timedOut) {
        throw new QRForgeAPIError({
          status: 0,
          code: "timeout",
          message: `Request timed out after ${this.timeoutMs} ms: ${method} ${path}`,
          cause: error,
        });
      }
      throw new QRForgeAPIError({
        status: 0,
        code: "network_error",
        message: `Network error: ${error?.message ?? error}`,
        cause: error,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const err = data?.error ?? {};
      throw new QRForgeAPIError({
        status: response.status,
        code: err.code ?? (response.status >= 500 ? "internal" : "http_error"),
        message: err.message ?? `Request failed with status ${response.status}`,
        fields: err.fields,
        retryAfter: parseRetryAfter(response.headers?.get?.("retry-after")),
      });
    }
    if (text && data === null) {
      throw new QRForgeAPIError({
        status: response.status,
        code: "invalid_response",
        message: "The server returned a response that is not JSON.",
      });
    }
    return data;
  }
}

export default QRForge;
