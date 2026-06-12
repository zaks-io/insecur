import {
  assertKnownErrorCodeRegistryCoverage,
  listKnownErrorCodes,
  parseErrorCodeRegistryTable,
  registryRowsByCode,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { exitCodeForErrorCode } from "../src/output/exit-codes.js";

describe("exit code registry lockstep", () => {
  const rows = parseErrorCodeRegistryTable();
  const rowsByCode = registryRowsByCode(rows);
  const catalogCodes = listKnownErrorCodes();

  it("includes every KnownErrorCode in docs/cli-and-sync.md", () => {
    expect(() => assertKnownErrorCodeRegistryCoverage(rowsByCode, catalogCodes)).not.toThrow();
  });

  it("keeps exitCodeForErrorCode aligned with the registry for catalog codes", () => {
    for (const code of catalogCodes) {
      const row = rowsByCode.get(code);
      expect(row, `missing registry row for ${code}`).toBeDefined();
      expect(exitCodeForErrorCode(code)).toBe(row?.exitCode);
    }
  });
});
