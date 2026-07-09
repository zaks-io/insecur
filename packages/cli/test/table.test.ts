import { afterEach, describe, expect, it } from "vitest";
import { renderTable, type Column } from "../src/output/table.js";
import { configureColor, resetStyleForTests } from "../src/output/style.js";
import { resetIdTruncationForTests } from "../src/output/cell-format.js";

const ESC = String.fromCharCode(27);

interface Row {
  readonly name: string;
  readonly id: string;
  readonly protectedFlag: boolean;
  readonly size: number;
}

const columns: Column<Row>[] = [
  { header: "Name", get: (r) => ({ kind: "plain", text: r.name, untrusted: true }) },
  { header: "Env ID", get: (r) => ({ kind: "id", text: r.id }) },
  { header: "Protected", get: (r) => ({ kind: "bool", value: r.protectedFlag }) },
  { header: "Bytes", get: (r) => ({ kind: "count", value: r.size }), align: "right" },
];

const rows: Row[] = [
  { name: "development", id: "env_NZ1PSC2H1FJ7NGN", protectedFlag: false, size: 4 },
  { name: "prod", id: "env_TU7V9X1ZABCDEF", protectedFlag: true, size: 128 },
];

afterEach(() => {
  resetStyleForTests();
  resetIdTruncationForTests();
});

describe("renderTable", () => {
  it("emits aligned uppercase headers and byte-clean output when color is off", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderTable(columns, rows);
    expect(out).not.toContain(ESC);
    const lines = out.split("\n");
    expect(lines[0]).toBe("NAME         ENV ID       PROTECTED  BYTES");
    // columns line up: the id column starts at the same offset on every row
    const headerIdCol = lines[0]?.indexOf("ENV ID") ?? -1;
    expect(lines[1]?.slice(headerIdCol, headerIdCol + 4)).toBe("env_");
    expect(lines[2]?.slice(headerIdCol, headerIdCol + 4)).toBe("env_");
  });

  it("renders booleans as Yes/No and right-aligns counts", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderTable(columns, rows);
    expect(out).toContain("No ");
    expect(out).toContain("Yes");
    // right-aligned: the single-digit and three-digit counts share a right edge
    const lines = out.split("\n");
    expect(lines[1]?.endsWith("  4")).toBe(true);
    expect(lines[2]?.endsWith("128")).toBe(true);
  });

  it("truncates ids in cells", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderTable(columns, rows);
    expect(out).toContain("env_NZ1PSC…");
  });

  it("wraps status words in color when color is on", () => {
    configureColor({ json: false, color: "always" }, {}, false);
    const out = renderTable(
      [{ header: "State", get: () => ({ kind: "status", text: "live", tone: "ok" }) }],
      [{}],
    );
    expect(out).toContain(ESC);
  });
});

describe("renderTable ANSI safety", () => {
  it("strips injected escapes from an untrusted cell even with color on", () => {
    configureColor({ json: false, color: "always" }, {}, false);
    const hostile = `dev${ESC}[31mIL${String.fromCharCode(7)}name`;
    const out = renderTable(
      [
        {
          header: "Name",
          get: (r: { name: string }) => ({ kind: "plain", text: r.name, untrusted: true }),
        },
      ],
      [{ name: hostile }],
    );
    // the raw injected red-open escape must not survive
    expect(out).not.toContain(`${ESC}[31mIL`);
    expect(out).toContain("dev");
    expect(out).toContain("name");
    // control char replaced with '?'
    expect(out).not.toContain(String.fromCharCode(7));
  });
});
