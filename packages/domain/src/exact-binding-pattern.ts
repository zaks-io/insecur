/** Pattern markers rejected for exact secret and provider binding selectors. */
export const EXACT_BINDING_PATTERN_MARKERS = [
  "*",
  "?",
  "%",
  "regex:",
  "prefix:",
  "suffix:",
  "tag:",
  "folder:",
] as const;

export function includesExactBindingPatternMarker(raw: string): boolean {
  for (const marker of EXACT_BINDING_PATTERN_MARKERS) {
    if (raw.includes(marker)) {
      return true;
    }
  }
  return false;
}
