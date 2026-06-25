import { describe, expect, it } from "vitest";
import { SECRET_ERROR_CODES } from "@insecur/domain";
import {
  DEFAULT_GENERATE_LENGTH_BYTES,
  MAX_GENERATED_SECRET_RANDOM_BYTES,
} from "../src/input/secret-value-limits.js";
import { parseGenerateLength } from "../src/input/generate-random-secret.js";
import { CliError } from "../src/output/cli-error.js";

describe("parseGenerateLength", () => {
  it("returns the default length when --length is omitted", () => {
    expect(parseGenerateLength(undefined)).toBe(DEFAULT_GENERATE_LENGTH_BYTES);
  });

  it("accepts valid positive integer strings", () => {
    expect(parseGenerateLength("16")).toBe(16);
    expect(parseGenerateLength("1")).toBe(1);
    expect(parseGenerateLength(String(MAX_GENERATED_SECRET_RANDOM_BYTES))).toBe(
      MAX_GENERATED_SECRET_RANDOM_BYTES,
    );
  });

  it.each([["16abc"], ["16.9"], ["0x10"], [""], ["0"], ["-1"], ["-16"], [" 16"], ["16 "]])(
    "rejects malformed --length value %j",
    (raw) => {
      expect(() => parseGenerateLength(raw)).toThrow(
        expect.objectContaining({
          code: SECRET_ERROR_CODES.invalidInputMode,
          message: "--length must be a positive integer.",
        } satisfies Partial<CliError>),
      );
    },
  );

  it("rejects values above the generated secret size limit", () => {
    expect(() => parseGenerateLength(String(MAX_GENERATED_SECRET_RANDOM_BYTES + 1))).toThrow(
      expect.objectContaining({
        code: SECRET_ERROR_CODES.valueTooLarge,
        message: "--length would exceed the V1 secret value size limit.",
      } satisfies Partial<CliError>),
    );
  });
});
