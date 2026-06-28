import { SECRET_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "../src/safe-secret-value-ingress.js";
import { SecretWriteError } from "../src/secret-write-error.js";

const SAFE_INGRESS = ["stdin", "generated", "request_body", "masked_prompt"];

const UNSAFE_INGRESS = [
  "argv",
  "query",
  "route_param",
  "file",
  "named_local_value_file",
  "get_request",
];

const UNKNOWN_INGRESS = ["cookie", "header", "stdinn", "request-body", "x-custom"];

function expectInputRequired(ingress: string): void {
  expect(() => assertSafeSecretValueIngress(ingress)).toThrow(SecretWriteError);

  try {
    assertSafeSecretValueIngress(ingress);
  } catch (error) {
    expect(error).toMatchObject({
      code: SECRET_ERROR_CODES.inputRequired,
      retryable: false,
    });
  }
}

describe("safe secret value ingress", () => {
  it("allows only documented Safe Sensitive Input Path ingress modes", () => {
    for (const ingress of SAFE_INGRESS) {
      expect(() => assertSafeSecretValueIngress(ingress)).not.toThrow();
    }
  });

  it("rejects documented unsafe ingress modes", () => {
    for (const ingress of UNSAFE_INGRESS) {
      expectInputRequired(ingress);
    }
  });

  it("fails closed for unknown ingress labels", () => {
    for (const ingress of UNKNOWN_INGRESS) {
      expectInputRequired(ingress);
    }
  });

  it("rejects named local value file paths but allows blank or undefined paths", () => {
    expect(() => rejectNamedLocalValueFile(".env")).toThrow(SecretWriteError);
    expect(() => rejectNamedLocalValueFile(undefined)).not.toThrow();
    expect(() => rejectNamedLocalValueFile("")).not.toThrow();
    expect(() => rejectNamedLocalValueFile("   ")).not.toThrow();
  });
});
