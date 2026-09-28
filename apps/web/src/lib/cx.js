/** Join class names, skipping falsy values. */
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}
