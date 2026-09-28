// Type definitions for @qrforge/core. The library itself is written in JavaScript.

export type ECCLevel = "L" | "M" | "Q" | "H";
export type OutputFormat = "svg" | "png" | "pdf";
export type OutputKind = "string" | "buffer" | "dataURL";
export type ModuleStyle = "square" | "rounded" | "soft" | "dots";
export type CornerStyle = "square" | "rounded" | "circle";
export type FrameStyle = "none" | "box" | "banner";
export type QRType = "url" | "text" | "wifi" | "vcard" | "email" | "sms" | "phone" | "location" | "calendar";

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface LogoOptions {
  /** Data URL, URL (SVG output only) or image bytes. */
  src?: string | Uint8Array;
  /** Pre-decoded RGBA pixels (PNG/PDF output). */
  pixels?: RGBAImage;
  /** Logo width as a fraction of the code width (0.05–0.35). Default 0.22. */
  size?: number;
  /** Empty space around the logo, in modules (0–4). Default 1. */
  padding?: number;
  /** Background colour behind the logo, or null for none. Default "#ffffff". */
  background?: string | null | false;
  /** Corner radius of the logo background as a fraction of its size (0–0.5). Default 0.2. */
  radius?: number;
  /** Remove modules behind the logo. Default true. */
  excavate?: boolean;
}

export interface LabelOptions {
  text: string;
  color?: string;
  /** Relative font size multiplier (0.5–2). Default 1. */
  size?: number;
}

export interface FrameOptions {
  style: FrameStyle;
  color?: string;
}

export interface StyleOptions {
  /** Output width in pixels (32–8192). Default 512. */
  size?: number;
  /** Quiet zone in modules (0–32). Default 4. */
  margin?: number;
  ecc?: ECCLevel;
  foreground?: string;
  /** Hex colour or "transparent". */
  background?: string;
  moduleStyle?: ModuleStyle;
  cornerStyle?: CornerStyle;
  cornerDotStyle?: CornerStyle;
  cornerColor?: string | null;
  logo?: LogoOptions | string | null;
  label?: LabelOptions | string | null;
  frame?: FrameOptions | FrameStyle | null;
}

export interface GenerateOptions extends StyleOptions {
  /** Content to encode. When `type` is set, the structured fields for that type. */
  data: string | Uint8Array | number | Record<string, unknown>;
  type?: QRType | "raw";
  format?: OutputFormat;
  output?: OutputKind;
  /** PNG renderer. "auto" uses canvas in browsers, the pure-JS rasteriser elsewhere. */
  renderer?: "auto" | "canvas" | "raster";
  /** PNG pixel density metadata. */
  dpi?: number;
  /** PDF page size. Default "fit". */
  pageSize?: "fit" | "A4" | "Letter" | "A5";
  /** Accessible title (SVG aria-label, PDF title). */
  title?: string;
  minVersion?: number;
  maxVersion?: number;
  mask?: number;
}

export interface QRMatrix {
  version: number;
  size: number;
  ecc: ECCLevel;
  mask: number;
  modules: boolean[][];
}

export interface Warning {
  code: string;
  severity: "info" | "warning" | "danger";
  message: string;
}

export interface Reliability {
  level: "good" | "fair" | "poor";
  warnings: Warning[];
  version: number;
  modules: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  options: StyleOptions;
}

export class QRForgeError extends Error {
  code: string;
  details?: { field?: string; [key: string]: unknown };
}

export function generateQR(options: GenerateOptions & { format?: "svg"; output?: "string" }): Promise<string>;
export function generateQR(options: GenerateOptions & { output: "dataURL" }): Promise<string>;
export function generateQR(options: GenerateOptions): Promise<string | Uint8Array>;
export function toSVG(options: GenerateOptions): string;
export function toPNG(options: GenerateOptions): Promise<Uint8Array>;
export function toPDF(options: GenerateOptions): Promise<Uint8Array>;
export function encode(data: string | Uint8Array, options?: { ecc?: ECCLevel; minVersion?: number; maxVersion?: number; mask?: number }): QRMatrix;
export function byteCapacity(version: number, ecc?: ECCLevel): number;
export function analyzeReliability(options: GenerateOptions): Reliability;
export function layoutQR(options: GenerateOptions): { content: string | Uint8Array; matrix: QRMatrix; options: Required<StyleOptions>; layout: Layout };
export function shapePath(shape: Shape): string;
export function mimeType(format: OutputFormat): string;
export function decodePNG(bytes: Uint8Array): Promise<RGBAImage>;
export function encodePNG(image: RGBAImage, options?: { dpi?: number }): Promise<Uint8Array>;
export function contrastRatio(a: string, b: string): number;

export type Shape =
  | { type: "rect"; x: number; y: number; w: number; h: number; r: [number, number, number, number]; hole?: Shape }
  | { type: "circle"; cx: number; cy: number; r: number; hole?: Shape };

export interface Layout {
  width: number;
  height: number;
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
  layers: { fill: string; crisp?: boolean; shapes: Shape[] }[];
  logo: { x: number; y: number; size: number; src: string | Uint8Array | null; pixels: RGBAImage | null } | null;
  text: { x: number; y: number; text: string; fontSize: number; color: string } | null;
}

export const presets: readonly Preset[];
export function getPreset(id: string): Preset | null;
export const MODULE_STYLES: readonly ModuleStyle[];
export const CORNER_STYLES: readonly CornerStyle[];
export const FRAME_STYLES: readonly FrameStyle[];
export const QR_TYPES: readonly QRType[];

export function url(input: string | { url: string }): string;
export function text(input: string | { text: string }): string;
export function wifi(input: { ssid: string; password?: string; encryption?: "WPA" | "WEP" | "nopass"; hidden?: boolean }): string;
export function vcard(input: {
  firstName?: string;
  lastName?: string;
  organization?: string;
  title?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  note?: string;
}): string;
export function email(input: { to: string; subject?: string; body?: string; cc?: string; bcc?: string }): string;
export function sms(input: { phone: string; message?: string }): string;
export function phone(input: string | { phone: string }): string;
export function location(input: {
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  format?: "geo" | "osm" | "google" | "apple";
}): string;
export function calendar(input: {
  title: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  location?: string;
  description?: string;
}): string;
export function buildPayload(type: QRType, input: unknown): string;
export const payloads: Readonly<Record<QRType, (input: any) => string>>;
