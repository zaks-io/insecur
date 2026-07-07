import { describe, expect, it } from "vitest";
import { parseDotenvImportFile } from "../src/input/dotenv-import-parser.js";

describe("parseDotenvImportFile", () => {
  it("parses dotenv key/value pairs without exposing values in the result shape", () => {
    const result = parseDotenvImportFile("API_KEY=secret-value\n# comment\nNODE_ENV=development\n");
    expect(result.parseIssues).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ parsedKey: "API_KEY", lineNumber: 1 });
    expect(new TextDecoder().decode(result.entries[0]?.valueUtf8 ?? new Uint8Array())).toBe(
      "secret-value",
    );
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("reports parse errors for lines that do not split into key=value", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n";
    const bareSecret = "super-secret-token-without-equals\n";
    const result = parseDotenvImportFile(`${pem}${bareSecret}API_KEY=value\n`);
    expect(result.parseIssues.map((issue) => issue.lineNumber)).toEqual([1, 2, 3, 4]);
    expect(result.parseIssues.every((issue) => issue.code === "import.parse_error")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("super-secret-token-without-equals");
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
  });

  it("supports export-prefixed lines and quoted values", () => {
    const result = parseDotenvImportFile('export DATABASE_URL="postgres://example"\n');
    expect(result.parseIssues).toEqual([]);
    expect(result.entries[0]?.parsedKey).toBe("DATABASE_URL");
    expect(new TextDecoder().decode(result.entries[0]?.valueUtf8 ?? new Uint8Array())).toBe(
      "postgres://example",
    );
  });
});
