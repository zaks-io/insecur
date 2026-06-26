import { describe, expect, it } from "vitest";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import { parseFencingToken } from "../src/sync-target-lease-persistence.js";

describe("sync target lease persistence helpers", () => {
  it("parses positive integer fencing tokens from lease rows", () => {
    expect(parseFencingToken({ fencing_token: "12" })).toBe(12);
  });

  it("rejects invalid fencing tokens from lease rows", () => {
    expect(() => parseFencingToken({ fencing_token: "0" })).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidMetadata,
        message: "fencingToken must be a positive integer",
      }),
    );

    expect(() => parseFencingToken({ fencing_token: "not-a-number" })).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidMetadata,
      }),
    );
  });
});
