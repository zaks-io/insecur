import { describe, expect, it } from "vitest";
import { parseShellRcExportKeys } from "../src/scan/shell-rc-parser.js";

describe("shell-rc-parser", () => {
  it("extracts export key names matching secret patterns without returning values", () => {
    const content = [
      "# comment",
      'export API_SECRET="super-secret-value-must-not-appear"',
      "export PATH=/usr/bin",
      "export DATABASE_PASSWORD='another-secret'",
      "",
    ].join("\n");

    const keys = parseShellRcExportKeys(content)
      .map((entry) => entry.key)
      .sort();
    expect(keys).toEqual(["API_SECRET", "DATABASE_PASSWORD"]);
    expect(JSON.stringify(keys)).not.toContain("super-secret");
    expect(JSON.stringify(keys)).not.toContain("another-secret");
  });

  it("ignores non-export assignments", () => {
    const content = "API_SECRET=inline-value\n";
    expect(parseShellRcExportKeys(content)).toHaveLength(0);
  });
});
