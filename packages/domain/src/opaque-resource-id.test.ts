import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "./error-codes.js";
import { parseOpaqueResourceId } from "./opaque-resource-id.js";
import { environmentId, organizationId } from "./resource-ids.js";

const VALID_ORG = "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const VALID_ENV = "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V";

describe("parseOpaqueResourceId", () => {
  it("accepts well-formed opaque IDs", () => {
    expect(parseOpaqueResourceId(VALID_ORG)).toEqual({
      ok: true,
      value: VALID_ORG,
    });
    expect(parseOpaqueResourceId(VALID_ENV, "env")).toEqual({
      ok: true,
      value: VALID_ENV,
    });
  });

  it("rejects malformed IDs and prefix mismatches", () => {
    expect(parseOpaqueResourceId("not-an-id")).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
    expect(parseOpaqueResourceId(VALID_ENV, "org")).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
    expect(parseOpaqueResourceId("org_short", "org")).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  });
});

describe("resource id brands", () => {
  it("parse and brand helpers enforce prefix", () => {
    expect(organizationId.parse(VALID_ORG).ok).toBe(true);
    expect(environmentId.brand(VALID_ENV)).toBe(VALID_ENV);
    expect(() => environmentId.brand(VALID_ORG)).toThrow();
  });
});
