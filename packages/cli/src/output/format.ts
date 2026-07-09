import { statusTone } from "./cell-format.js";
import { getStyle, type Styler } from "./style.js";

/** Resolve the style role for a status tone. Shared by table cells + detail views. */
export function toneRole(
  s: Styler,
  tone: ReturnType<typeof statusTone>,
): (value: string) => string {
  switch (tone) {
    case "ok":
      return s.ok;
    case "warn":
      return s.warn;
    case "danger":
      return s.danger;
    case "muted":
      return s.meta;
  }
}

/** A status enum value styled by its tone (green/yellow/red/dim). */
export function statusText(value: string): string {
  const s = getStyle();
  return toneRole(s, statusTone(value))(value);
}

/**
 * Shared human-output primitives for success lines, remediation, and empty
 * states. List/detail layout lives in table.ts / detail.ts. Trusted literals
 * only: callers sanitize untrusted content before passing it here.
 */

/** A completed action. Glyph stays monochrome — routine success is quiet. */
export function successLine(message: string): string {
  const s = getStyle();
  return `${s.glyph("ok")} ${message}`;
}

/** Join facets of a one-line result with dim bullets: `a  ·  b  ·  c`. */
export function facets(parts: readonly string[]): string {
  const s = getStyle();
  return parts.join(`  ${s.meta(s.glyph("bullet"))}  `);
}

/** A public, non-secret handle (org/project/env/secret ids) — cyan. */
export function openId(id: string): string {
  return getStyle().id(id);
}

/** A remediation step: dim arrow, dim connective word, underlined command. */
export function remediationStep(connective: string, command: string): string {
  const s = getStyle();
  return `  ${s.meta(s.glyph("arrow"))} ${s.meta(connective)} ${s.action(command)}`;
}

/**
 * An empty-list line: a dim guidance sentence and, optionally, an underlined
 * next command. Reads as direction, not an error, and never as a bare `0`.
 */
export function emptyState(sentence: string, command?: string): string {
  const s = getStyle();
  if (command === undefined) {
    return s.meta(sentence);
  }
  return `${s.meta(sentence)}  ${s.action(command)}`;
}
