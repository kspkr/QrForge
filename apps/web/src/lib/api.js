/**
 * Minimal client for the QRForge REST API (same origin).
 * Session cookies are sent automatically; unsafe requests carry the CSRF token.
 */

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error ?? {};
    super(err.message || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = err.code || "unknown";
    this.fields = err.fields || {};
  }
}

function buildQuery(params) {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function request(method, path, { body, query, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && method !== "HEAD" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let response;
  try {
    response = await fetch(`/api/v1${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, { error: { code: "network_error", message: "Could not reach the QRForge server." } });
  }

  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const api = {
  get: (path, query, opts) => request("GET", path, { query, ...opts }),
  post: (path, body, opts) => request("POST", path, { body: body ?? {}, ...opts }),
  patch: (path, body, opts) => request("PATCH", path, { body, ...opts }),
  del: (path, opts) => request("DELETE", path, opts),
};
