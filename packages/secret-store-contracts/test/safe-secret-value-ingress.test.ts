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

function expectSecretWriteInputRequired(run: () => void, message: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SecretWriteError);
    expect(error).toMatchObject({
      code: SECRET_ERROR_CODES.inputRequired,
      message,
      retryable: false,
    });
    return;
  }
  throw new Error("expected secret write input validation to fail closed");
}

function expectSafeIngressRejected(ingress: string): void {
  expectSecretWriteInputRequired(() => {
    assertSafeSecretValueIngress(ingress);
  }, "Secret values must use a safe input path (stdin, generation, request body, or masked prompt).");
}

describe("safe secret value ingress", () => {
  it("allows only documented Safe Sensitive Input Path ingress modes", () => {
    for (const ingress of SAFE_INGRESS) {
      assertSafeSecretValueIngress(ingress);
    }
  });

  it("rejects documented unsafe ingress modes", () => {
    for (const ingress of UNSAFE_INGRESS) {
      expectSafeIngressRejected(ingress);
    }
  });

  it("fails closed for unknown ingress labels", () => {
    for (const ingress of UNKNOWN_INGRESS) {
      expectSafeIngressRejected(ingress);
    }
  });

  it("rejects named local value file paths but allows blank or undefined paths", () => {
    expectSecretWriteInputRequired(() => {
      rejectNamedLocalValueFile(".env");
    }, "Named local value files are not allowed for secret writes.");
    rejectNamedLocalValueFile(undefined);
    rejectNamedLocalValueFile("");
    rejectNamedLocalValueFile("   ");
  });
});
