import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, ReactNode, RefAttributes, CSSProperties } from "react";
import type { GenerateOptions, Layout, QRMatrix, Reliability, StyleOptions, QRType, ECCLevel, Preset } from "@qrforge/core";

export type ExportFormat = "svg" | "png" | "pdf";

export interface QROptionsProps extends StyleOptions {
  /** Content to encode (alias of `data`). */
  value?: string;
  /** Content, or structured fields when `type` is set. */
  data?: GenerateOptions["data"];
  type?: QRType;
  /** Apply a built-in preset (e.g. "modern"); explicit props override it. */
  preset?: string;
  /** Alias of `ecc`. */
  errorCorrection?: ECCLevel;
  /** Alias of `foreground`. */
  fgColor?: string;
  /** Alias of `background`. */
  bgColor?: string;
  title?: string;
}

export interface QRCodeProps
  extends QROptionsProps,
    Omit<ComponentPropsWithoutRef<"svg">, "type" | "values" | "fill" | "title"> {
  /** "svg" (default) renders inline SVG, "png" renders an <img>. */
  format?: "svg" | "png";
  className?: string;
  style?: CSSProperties;
  alt?: string;
  fallback?: ReactNode;
  onError?: (error: Error & { code?: string }) => void;
}

export interface QRCodeHandle {
  download(format?: ExportFormat, filename?: string): Promise<void>;
  toDataURL(format?: ExportFormat): Promise<string>;
  toSVG(): Promise<string>;
}

export const QRCode: ForwardRefExoticComponent<QRCodeProps & RefAttributes<QRCodeHandle>>;

export interface QRDownloadButtonProps extends QROptionsProps {
  format?: ExportFormat;
  filename?: string;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onDownload?: (format: ExportFormat) => void;
  onError?: (error: Error) => void;
}

export function QRDownloadButton(props: QRDownloadButtonProps): JSX.Element;

export interface UseQRCodeResult extends QRCodeHandle {
  layout: Layout | null;
  matrix: QRMatrix | null;
  content: string | Uint8Array | null;
  error: (Error & { code?: string }) | null;
  reliability: Reliability | null;
  options: GenerateOptions;
}

export function useQRCode(props: QROptionsProps): UseQRCodeResult;
export function toCoreOptions(props: QROptionsProps): GenerateOptions;
export function downloadQR(options: GenerateOptions | QROptionsProps, settings?: { format?: ExportFormat; filename?: string }): Promise<void>;
export function saveFile(content: string | Uint8Array | Blob, filename: string, mime: string): void;
export const presets: readonly Preset[];
