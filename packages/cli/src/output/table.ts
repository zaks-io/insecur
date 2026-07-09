import { relativeTime, truncateId, type StatusTone } from "./cell-format.js";
import { toneRole } from "./format.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle, type Styler } from "./style.js";

export type Cell =
  | { readonly kind: "plain"; readonly text: string; readonly untrusted?: boolean }
  | { readonly kind: "id"; readonly text: string }
  | { readonly kind: "status"; readonly text: string; readonly tone: StatusTone }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "time"; readonly iso: string | null | undefined }
  | { readonly kind: "count"; readonly value: number };

export interface Column<Row> {
  readonly header: string;
  readonly get: (row: Row) => Cell;
  readonly align?: "left" | "right";
}

const GUTTER = "  ";

function visibleWidth(text: string): number {
  return Array.from(text).length;
}

function plainText(cell: Extract<Cell, { kind: "plain" }>): string {
  return cell.untrusted === true ? sanitizeDisplayText(cell.text) : cell.text;
}

/** The visible (uncolored) text of a cell, used for width measurement. */
function cellPlainText(cell: Cell, s: Styler): string {
  switch (cell.kind) {
    case "plain":
      return plainText(cell);
    case "id":
      return truncateId(cell.text, s.ascii);
    case "status":
      return sanitizeDisplayText(cell.text);
    case "bool":
      return cell.value ? "Yes" : "No";
    case "time":
      return relativeTime(cell.iso);
    case "count":
      return String(cell.value);
  }
}

/** Apply the cell's style role to its already-measured plain text. */
function cellStyled(cell: Cell, plain: string, s: Styler): string {
  switch (cell.kind) {
    case "id":
      return s.id(plain);
    case "status":
      return toneRole(s, cell.tone)(plain);
    case "bool":
      return cell.value ? plain : s.meta(plain);
    case "plain":
    case "time":
    case "count":
      return plain;
  }
}

function pad(text: string, width: number, right: boolean): string {
  const spaces = " ".repeat(Math.max(0, width - visibleWidth(text)));
  return right ? `${spaces}${text}` : `${text}${spaces}`;
}

/**
 * Render rows as an aligned, uncolored-safe table: bold uppercase headers, a
 * two-space gutter, one record per line. Width is always measured on the
 * sanitized/pre-color plain text and the style span is applied only after
 * padding, so ANSI codes never distort alignment and untrusted content can
 * never inject escapes into the layout. Emits nothing extra when color is off.
 */
interface PreparedColumn {
  readonly header: string;
  readonly right: boolean;
  readonly width: number;
  readonly cells: readonly { readonly cell: Cell; readonly plain: string }[];
}

function prepareColumns<Row>(
  columns: readonly Column<Row>[],
  rows: readonly Row[],
  s: Styler,
): PreparedColumn[] {
  return columns.map((column) => {
    const header = column.header.toUpperCase();
    const cells = rows.map((row) => {
      const cell = column.get(row);
      return { cell, plain: cellPlainText(cell, s) };
    });
    const width = Math.max(
      visibleWidth(header),
      ...cells.map((entry) => visibleWidth(entry.plain)),
    );
    return { header, right: column.align === "right", width, cells };
  });
}

/**
 * Render rows as an aligned table (see file-level doc). Columns are prepared once
 * so alignment never depends on fragile index math.
 */
export function renderTable<Row>(columns: readonly Column<Row>[], rows: readonly Row[]): string {
  const s = getStyle();
  const prepared = prepareColumns(columns, rows, s);
  const lastIndex = prepared.length - 1;

  const headerLine = prepared
    .map((column, index) => {
      const padded =
        index === lastIndex && !column.right
          ? column.header
          : pad(column.header, column.width, column.right);
      return s.heading(padded);
    })
    .join(GUTTER);

  const bodyLines = rows.map((_row, rowIndex) =>
    prepared
      .map((column, index) => {
        const entry = column.cells[rowIndex];
        if (entry === undefined) {
          return "";
        }
        const padded =
          index === lastIndex && !column.right
            ? entry.plain
            : pad(entry.plain, column.width, column.right);
        return cellStyled(entry.cell, padded, s);
      })
      .join(GUTTER),
  );

  return [headerLine, ...bodyLines].join("\n");
}
