const ESC = String.fromCharCode(27);
const ANSI_SEQUENCE = new RegExp(`${ESC}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`, "gu");

/**
 * Strip ANSI escape sequences and C0/DEL control characters from untrusted
 * text before it is written to a human terminal. This is the boundary that
 * keeps attacker-controlled values (paths, display names, keys) from injecting
 * their own color, moving the cursor, or corrupting the line. Style spans are
 * only ever applied to the RESULT of this function, never to raw input.
 */
export function sanitizeDisplayText(value: string): string {
  const withoutAnsi = value.replace(ANSI_SEQUENCE, "");
  let sanitized = "";
  for (let index = 0; index < withoutAnsi.length; index += 1) {
    const code = withoutAnsi.charCodeAt(index);
    sanitized += code <= 0x1f || code === 0x7f ? "?" : withoutAnsi.charAt(index);
  }
  return sanitized;
}
