// Type definitions for @qrforge/sdk.

export type QRKind = "static" | "dynamic";
export type QRType = "url" | "text" | "wifi" | "vcard" | "email" | "sms" | "phone" | "location" | "calendar";
export type AnalyticsRange = "24h" | "7d" | "30d" | "90d" | "365d" | "all";

export interface UTM {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface QRCode {
  id: string;
  name: string;
  kind: QRKind;
  qr_type: QRType;
  content: string;
  destination: string | null;
  slug: string | null;
  redirect_url: string | null;
  status: "active" | "disabled";
  disabled_reason: string | null;
  admin_locked: boolean;
  expires_at: string | null;
  has_password: boolean;
  utm: UTM | null;
  analytics_enabled: boolean;
  campaign_id: string | null;
  domain_id: string | null;
  design: Record<string, unknown> | null;
  form_data: Record<string, unknown> | null;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateQRCodeInput {
  name: string;
  kind?: QRKind;
  destination?: string;
  qr_type?: QRType;
  content?: string;
  slug?: string;
  expires_at?: string | null;
  password?: string;
  utm?: UTM | null;
  analytics_enabled?: boolean;
  campaign_id?: string | null;
  domain_id?: string | null;
  design?: Record<string, unknown> | null;
  form_data?: Record<string, unknown> | null;
}

export interface UpdateQRCodeInput extends Partial<Omit<CreateQRCodeInput, "kind" | "password">> {
  status?: "active" | "disabled";
  password?: string | null;
}

export interface ListQRCodesParams {
  page?: number;
  per_page?: number;
  kind?: QRKind;
  status?: "active" | "disabled";
  campaign_id?: string;
  q?: string;
  sort?: "created_at" | "-created_at" | "name" | "-scan_count";
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
}

export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface Analytics {
  totals: { total_scans: number; unique_scans: number; today: number; this_week: number; this_month: number };
  range: { key: AnalyticsRange; from: string; to: string; granularity: "hour" | "day" };
  timeseries: { bucket: string; scans: number; unique: number }[];
  range_totals: { scans: number; unique: number };
  browsers: NamedCount[];
  os: NamedCount[];
  devices: NamedCount[];
  countries: NamedCount[];
  referrers: NamedCount[];
}

export interface HistoryEntry {
  destination: string;
  previous_destination: string | null;
  changed_at: string;
  changed_by_email: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  qr_count: number;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

export interface Domain {
  id: string;
  hostname: string;
  verified: boolean;
  verification_record: { type: "TXT"; name: string; value: string };
  created_at: string;
  verified_at: string | null;
}

export interface QRForgeOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class QRForgeAPIError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  retryAfter: number | null;
}

export class QRForge {
  constructor(options: QRForgeOptions);
  readonly baseUrl: string;

  qrcodes: {
    create(body: CreateQRCodeInput): Promise<QRCode>;
    list(params?: ListQRCodesParams): Promise<Page<QRCode>>;
    get(id: string): Promise<QRCode>;
    update(id: string, body: UpdateQRCodeInput): Promise<QRCode>;
    delete(id: string): Promise<null>;
    analytics(id: string, params?: { range?: AnalyticsRange }): Promise<Analytics>;
    rotateSlug(id: string): Promise<QRCode>;
    duplicate(id: string): Promise<QRCode>;
    history(id: string): Promise<{ data: HistoryEntry[] }>;
    listAll(params?: ListQRCodesParams): AsyncGenerator<QRCode>;
  };

  campaigns: {
    create(body: { name: string; description?: string; color?: string | null }): Promise<Campaign>;
    list(params?: { page?: number; per_page?: number }): Promise<Page<Campaign>>;
    get(id: string): Promise<Campaign>;
    update(id: string, body: { name?: string; description?: string; color?: string | null }): Promise<Campaign>;
    delete(id: string): Promise<null>;
    analytics(
      id: string,
      params?: { range?: AnalyticsRange },
    ): Promise<Analytics & { per_qrcode: { id: string; name: string; scans: number }[] }>;
    listAll(params?: { per_page?: number }): AsyncGenerator<Campaign>;
  };

  analytics: {
    overview(params?: {
      range?: AnalyticsRange;
    }): Promise<Analytics & { top_qrcodes: { id: string; name: string; scans: number }[] }>;
  };

  domains: {
    list(params?: { page?: number; per_page?: number }): Promise<Page<Domain>>;
  };

  health(): Promise<{ status: string; version: string; database: string }>;
  config(): Promise<{
    version: string;
    base_url: string;
    registration_enabled: boolean;
    setup_required: boolean;
    features: { analytics: boolean; custom_domains: boolean; password_reset_email: boolean };
    limits: { max_redirect_length: number };
  }>;

  paginate<T = unknown>(path: string, params?: Record<string, unknown>): AsyncGenerator<T>;
  request<T = unknown>(
    method: string,
    path: string,
    options?: { query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
}

export default QRForge;
