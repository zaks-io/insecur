import { SECRET_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "../src/safe-secret-value-ingress.js";
import { SecretWriteError } from "../src/secret-write-error.js";

describe("safe secret value ingress", () => {
  it("allows stdin, generated, request body, and masked prompt", () => {
    expect(() => assertSafeSecretValueIngress("stdin")).not.toThrow();
    expect(() => assertSafeSecretValueIngress("generated")).not.toThrow();
    expect(() => assertSafeSecretValueIngress("request_body")).not.toThrow();
    expect(() => assertSafeSecretValueIngress("masked_prompt")).not.toThrow();
  });

  it("rejects argv, query, file, named local value file, and unknown ingress", () => {
    for (const ingress of [
      "argv",
      "query",
      "file",
      "named_local_value_file",
      "get_request",
      "route_param",
      "stdinn",
      "request-body",
    ]) {
      expect(() => assertSafeSecretValueIngress(ingress)).toThrow(SecretWriteError);
      try {
        assertSafeSecretValueIngress(ingress);
      } catch (error) {
        expect(error).toMatchObject({ code: SECRET_ERROR_CODES.inputRequired });
      }
    }
  });

  it("rejects named local value file paths but allows blank or undefined paths", () => {
    expect(() => rejectNamedLocalValueFile(".env")).toThrow(SecretWriteError);
    expect(() => rejectNamedLocalValueFile(undefined)).not.toThrow();
    expect(() => rejectNamedLocalValueFile("")).not.toThrow();
    expect(() => rejectNamedLocalValueFile("   ")).not.toThrow();
  });
});
