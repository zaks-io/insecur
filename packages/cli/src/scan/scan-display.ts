import { sanitizeDisplayText } from "../output/sanitize-display.js";

/** Strip control and ANSI sequences from paths before human output. */
export function sanitizeScanDisplayPath(path: string): string {
  return sanitizeDisplayText(path);
}
