import {
  CLIENT_SIDE_HTTP_MARKER,
  parseErrorCodeRegistryTable,
  REMEDIATION_REQUIRED_MARKER,
  registryRowsByCode,
} from "@insecur/domain/error-code-registry";
import { describe, expect, it } from "vitest";
import {
  CLI_REMEDIATION_BY_CODE,
  CLI_REMEDIATION_SUPPLEMENT_CODES,
} from "../src/output/cli-remediation.js";

function hasRemediationContent(code: string): boolean {
  return (
    CLI_REMEDIATION_BY_CODE[code as keyof typeof CLI_REMEDIATION_BY_CODE] !== undefined ||
    CLI_REMEDIATION_SUPPLEMENT_CODES.has(code as never)
  );
}

describe("remediation registry lockstep", () => {
  const rows = parseErrorCodeRegistryTable();
  const rowsByCode = registryRowsByCode(rows);

  it("marks every CLI remediation implementation as required in docs/cli-and-sync.md", () => {
    for (const code of Object.keys(CLI_REMEDIATION_BY_CODE)) {
      const row = rowsByCode.get(code);
      expect(row?.remediation, `missing registry row for ${code}`).toBe(
        REMEDIATION_REQUIRED_MARKER,
      );
    }
    for (const code of CLI_REMEDIATION_SUPPLEMENT_CODES) {
      const row = rowsByCode.get(code);
      expect(row?.remediation, `missing registry row for ${code}`).toBe(
        REMEDIATION_REQUIRED_MARKER,
      );
    }
  });

  it("requires CLI remediation content for client-side remediation-required codes", () => {
    for (const row of rows) {
      if (row.remediation !== REMEDIATION_REQUIRED_MARKER) {
        continue;
      }
      if (row.httpStatus !== CLIENT_SIDE_HTTP_MARKER) {
        continue;
      }
      expect(
        hasRemediationContent(row.code),
        `client-side remediation-required code missing CLI remediation: ${row.code}`,
      ).toBe(true);
    }
  });
});
