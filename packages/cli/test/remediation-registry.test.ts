import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  parseErrorCodeRegistryTable,
  REMEDIATION_REQUIRED_MARKER,
  registryRowsByCode,
  type ErrorCodeRegistryRow,
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

function assertRemediationRequiredCodesHaveContent(rows: readonly ErrorCodeRegistryRow[]): void {
  for (const row of rows) {
    if (row.remediation !== REMEDIATION_REQUIRED_MARKER) {
      continue;
    }
    if (!hasRemediationContent(row.code)) {
      throw new Error(`remediation-required code missing CLI remediation: ${row.code}`);
    }
  }
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

  it("requires CLI remediation content for every remediation-required code", () => {
    expect(() => {
      assertRemediationRequiredCodesHaveContent(rows);
    }).not.toThrow();
  });

  it("fails when an HTTP-backed remediation-required code lacks CLI remediation content", () => {
    const withoutAuthRemediation = Object.fromEntries(
      Object.entries(CLI_REMEDIATION_BY_CODE).filter(
        ([code]) => code !== AUTH_ERROR_CODES.required,
      ),
    ) as Partial<typeof CLI_REMEDIATION_BY_CODE>;

    expect(() => {
      for (const row of rows) {
        if (row.remediation !== REMEDIATION_REQUIRED_MARKER) {
          continue;
        }
        const hasContent =
          withoutAuthRemediation[row.code as keyof typeof withoutAuthRemediation] !== undefined ||
          CLI_REMEDIATION_SUPPLEMENT_CODES.has(row.code as never);
        if (!hasContent) {
          throw new Error(`remediation-required code missing CLI remediation: ${row.code}`);
        }
      }
    }).toThrow(/remediation-required code missing CLI remediation: auth\.required/);
  });
});
