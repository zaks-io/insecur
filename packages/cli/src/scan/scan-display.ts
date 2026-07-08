/** Strip control and ANSI sequences from paths before human output. */
export function sanitizeScanDisplayPath(path: string): string {
  const esc = String.fromCharCode(27);
  const withoutAnsi = path.replace(new RegExp(`${esc}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`, "u"), "");

  let sanitized = "";
  for (let index = 0; index < withoutAnsi.length; index += 1) {
    const char = withoutAnsi.charAt(index);
    const code = withoutAnsi.charCodeAt(index);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) {
      sanitized += "?";
    } else {
      sanitized += char;
    }
  }
  return sanitized;
}
