import {
  AUTH_ERROR_CODES,
  CLIENT_SIDE_HTTP_MARKER,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  assertKnownErrorCodeRegistryCoverage,
  assertRegistryHttpLockstep,
  listKnownErrorCodes,
  parseErrorCodeRegistryTable,
  registryRowsByCode,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { httpStatusForKnownErrorCode } from "./domain-error-response.js";
import { HTTP_STATUS_BY_CODE } from "./http-status-by-code.js";

describe("error code registry lockstep", () => {
  const rows = parseErrorCodeRegistryTable();
  const rowsByCode = registryRowsByCode(rows);
  const catalogCodes = listKnownErrorCodes();

  it("includes every KnownErrorCode in docs/cli-and-sync.md", () => {
    expect(() => {
      assertKnownErrorCodeRegistryCoverage(rowsByCode, catalogCodes);
    }).not.toThrow();
  });

  it("keeps HTTP_STATUS_BY_CODE aligned with the registry in both directions", () => {
    expect(() => {
      assertRegistryHttpLockstep(HTTP_STATUS_BY_CODE, rows);
    }).not.toThrow();
  });

  it("preserves deliberate forbidden/not-found indistinguishability mappings", () => {
    expect(HTTP_STATUS_BY_CODE.get(INJECTION_ERROR_CODES.grantDenied)).toBe(404);
    expect(HTTP_STATUS_BY_CODE.get(INJECTION_ERROR_CODES.grantExpired)).toBe(404);
    expect(rowsByCode.get(INJECTION_ERROR_CODES.grantDenied)?.httpStatus).toBe(404);
    expect(rowsByCode.get(INJECTION_ERROR_CODES.grantExpired)?.httpStatus).toBe(404);
  });

  it("preserves the opaque crypto decrypt failure mapping", () => {
    expect(HTTP_STATUS_BY_CODE.get(CRYPTO_ERROR_CODES.decryptFailed)).toBe(500);
    expect(rowsByCode.get(CRYPTO_ERROR_CODES.decryptFailed)?.httpStatus).toBe(500);
  });

  it("does not silently fall back to HTTP 500 for catalog codes", () => {
    for (const code of catalogCodes) {
      const row = rowsByCode.get(code);
      if (row?.httpStatus === CLIENT_SIDE_HTTP_MARKER) {
        expect(HTTP_STATUS_BY_CODE.has(code)).toBe(false);
        expect(() => httpStatusForKnownErrorCode(code)).toThrow(
          /client-side-only|missing an HTTP status/,
        );
        continue;
      }
      expect(httpStatusForKnownErrorCode(code)).toBe(row?.httpStatus);
    }
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.required)).not.toBe(500);
    expect(httpStatusForKnownErrorCode(CRYPTO_ERROR_CODES.decryptFailed)).toBe(500);
  });

  it("fails when a catalog code is missing from the registry table", () => {
    const mutated = new Map(rowsByCode);
    const removedCode = catalogCodes[0] ?? AUTH_ERROR_CODES.required;
    mutated.delete(removedCode);
    expect(() => {
      assertKnownErrorCodeRegistryCoverage(mutated, catalogCodes);
    }).toThrow(/missing from docs\/cli-and-sync\.md registry/);
  });

  it("fails when the HTTP map contains a code missing from the registry table", () => {
    const mutated = new Map(HTTP_STATUS_BY_CODE);
    mutated.set("synthetic.unregistered_code", 418);
    expect(() => {
      assertRegistryHttpLockstep(mutated, rows);
    }).toThrow(/unregistered code/);
  });

  it("fails when the HTTP map disagrees with the registry table", () => {
    const mutated = new Map(HTTP_STATUS_BY_CODE);
    mutated.set(AUTH_ERROR_CODES.required, 418);
    expect(() => {
      assertRegistryHttpLockstep(mutated, rows);
    }).toThrow(/HTTP status mismatch/);
  });
});
