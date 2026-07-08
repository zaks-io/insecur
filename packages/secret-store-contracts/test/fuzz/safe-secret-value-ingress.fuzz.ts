import { SECRET_ERROR_CODES } from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "../../src/safe-secret-value-ingress.js";
import { SecretWriteError } from "../../src/secret-write-error.js";

const SAFE_INGRESS = ["stdin", "generated", "request_body", "masked_prompt"] as const;

function expectInputRequired(fn: () => unknown): void {
  expect(fn).toThrow(SecretWriteError);
  expect(fn).toThrow(expect.objectContaining({ code: SECRET_ERROR_CODES.inputRequired }));
}

describe("safe secret value ingress fuzz", () => {
  it("only accepts the documented safe ingress labels", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 96 }), (ingress) => {
        const isSafe = (SAFE_INGRESS as readonly string[]).includes(ingress);

        if (isSafe) {
          expect(() => assertSafeSecretValueIngress(ingress)).not.toThrow();
          return;
        }

        expectInputRequired(() => assertSafeSecretValueIngress(ingress));
      }),
      {
        examples: [
          ["stdin"],
          ["generated"],
          ["request_body"],
          ["masked_prompt"],
          ["argv"],
          ["request-body"],
          ["stdin "],
        ],
      },
    );
  });

  it("rejects every nonblank named local value file path", () => {
    fc.assert(
      fc.property(fc.option(fc.string({ maxLength: 128 }), { nil: undefined }), (path) => {
        if (path === undefined || path.trim() === "") {
          expect(() => rejectNamedLocalValueFile(path)).not.toThrow();
          return;
        }

        expectInputRequired(() => rejectNamedLocalValueFile(path));
      }),
      { examples: [[undefined], [""], ["   "], [".env"], ["/tmp/secret.txt"]] },
    );
  });
});
