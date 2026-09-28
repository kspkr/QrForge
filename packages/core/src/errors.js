/**
 * Error thrown by QRForge for invalid input or options.
 * `code` is a stable, machine-readable identifier (e.g. "DATA_TOO_LONG").
 */
export class QRForgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "QRForgeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
