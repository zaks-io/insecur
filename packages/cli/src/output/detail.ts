import { getStyle, type Styler } from "./style.js";

export interface DetailValue {
  readonly label: string;
  /** Already-styled value string (ids cyan, status toned). Use `—` for empty. */
  readonly value: string;
}

export interface DetailSection {
  readonly heading: string;
  /** Either aligned kv pairs or a pre-rendered block (e.g. a nested table). */
  readonly pairs?: readonly DetailValue[];
  readonly block?: string;
}

function padLabels(pairs: readonly DetailValue[], s: Styler, indent: string): string[] {
  const width = Math.max(...pairs.map((pair) => pair.label.length), 0);
  return pairs.map((pair) => `${indent}${s.label(pair.label.padEnd(width))}  ${pair.value}`);
}

function sectionLines(section: DetailSection, s: Styler): string[] {
  const lines = ["", s.heading(section.heading)];
  if (section.pairs !== undefined) {
    lines.push(...padLabels(section.pairs, s, "  "));
  }
  if (section.block !== undefined) {
    lines.push(...section.block.split("\n").map((line) => `  ${line}`));
  }
  return lines;
}

/**
 * A single-record detail view: bold right-padded labels (no colon) with a
 * two-space gutter, optional bold-headed sections beneath. Values are passed in
 * already styled by the caller (so ids/status keep their color); labels are
 * trusted literals. The em-dash `—` convention marks an absent value.
 */
export function renderDetail(
  pairs: readonly DetailValue[],
  sections: readonly DetailSection[] = [],
): string {
  const s = getStyle();
  const lines = padLabels(pairs, s, "");
  for (const section of sections) {
    lines.push(...sectionLines(section, s));
  }
  return lines.join("\n");
}

/** The em-dash marker for an absent value, dimmed. */
export function emptyValue(): string {
  return getStyle().meta("—");
}
