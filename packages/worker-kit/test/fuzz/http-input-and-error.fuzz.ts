import {
  DEFAULT_UNKNOWN_ERROR_CODE,
  parseVariableKey,
  runtimePolicyId,
  secretId,
  type VariableKey,
} from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  GENERIC_ERROR_MESSAGE,
  safePublicErrorMessage,
} from "../../src/http/domain-error-response.js";
import {
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
} from "../../src/http/parse-injection-grant-selector.js";

const VARIABLE_HEAD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_";
const VARIABLE_TAIL_CHARS = `${VARIABLE_HEAD_CHARS}0123456789`;
const idBodyArb = fc
  .array(fc.integer({ min: 0, max: 35 }), { minLength: 26, maxLength: 26 })
  .map((digits) => digits.map((digit) => digit.toString(36).toUpperCase()).join(""));
const variableKeyArb: fc.Arbitrary<VariableKey> = fc
  .tuple(
    fc.constantFrom(...VARIABLE_HEAD_CHARS.split("")),
    fc.array(fc.constantFrom(...VARIABLE_TAIL_CHARS.split("")), { maxLength: 63 }),
  )
  .map(([head, tail]) => {
    const parsed = parseVariableKey(`${head}${tail.join("")}`);
    if (!parsed.ok) {
      throw new Error("generated invalid variable key");
    }
    return parsed.value;
  });
const secretIdArb = idBodyArb.map((body) => secretId.brand(`sec_${body}`));
const policyIdArb = idBodyArb.map((body) => runtimePolicyId.brand(`rp_${body}`));
const ABSENT = Symbol("absent");
const maybeFieldArb = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined | typeof ABSENT> =>
  fc.oneof(fc.constant(ABSENT), fc.constant(undefined), arb);
const selectorBodyArb = fc
  .tuple(maybeFieldArb(variableKeyArb), maybeFieldArb(secretIdArb), maybeFieldArb(policyIdArb))
  .map(([variableKey, secretIdValue, policyIdValue]) => {
    const body: Record<string, unknown> = {};
    if (variableKey !== ABSENT) {
      body.variableKey = variableKey;
    }
    if (secretIdValue !== ABSENT) {
      body.secretId = secretIdValue;
    }
    if (policyIdValue !== ABSENT) {
      body.policyId = policyIdValue;
    }
    return body;
  });

function expectValidationFailure(fn: () => unknown): void {
  expect(fn).toThrow(
    expect.objectContaining({
      code: expect.stringMatching(/^validation\./u),
    }),
  );
}

function hasOwnField(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

describe("HTTP input and error fuzz", () => {
  it("parses issue selectors only when exactly one selector field is present", () => {
    fc.assert(
      fc.property(selectorBodyArb, (body) => {
        const present = ["variableKey", "secretId", "policyId"].filter((field) =>
          hasOwnField(body, field),
        );
        const selectedValue = present.length === 1 ? body[present[0] ?? ""] : undefined;

        if (present.length !== 1 || selectedValue === undefined) {
          expectValidationFailure(() => parseInjectionGrantIssueSelector(body));
          return;
        }

        const parsed = parseInjectionGrantIssueSelector(body);
        if (hasOwnField(body, "variableKey")) {
          expect(parsed).toEqual({ kind: "variable_key", variableKey: body.variableKey });
        } else if (hasOwnField(body, "secretId")) {
          expect(parsed).toEqual({ kind: "secret_id", secretId: body.secretId });
        } else {
          expect(parsed).toEqual({ kind: "policy_id", policyId: body.policyId });
        }
      }),
    );
  });

  it("parses consume selectors only from variableKey or secretId and never from policyId", () => {
    fc.assert(
      fc.property(selectorBodyArb, (body) => {
        const presentConsumeSelectors = ["variableKey", "secretId"].filter((field) =>
          hasOwnField(body, field),
        );
        const selectedValue =
          presentConsumeSelectors.length === 1 ? body[presentConsumeSelectors[0] ?? ""] : undefined;

        if (
          presentConsumeSelectors.length !== 1 ||
          selectedValue === undefined ||
          hasOwnField(body, "policyId")
        ) {
          expectValidationFailure(() => parseInjectionGrantConsumeSelector(body));
          return;
        }

        const parsed = parseInjectionGrantConsumeSelector(body);
        expect(parsed.kind).toBe(hasOwnField(body, "variableKey") ? "variable_key" : "secret_id");
      }),
    );
  });

  it("redacts arbitrary unexpected error messages at the public boundary", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 256 }), (message) => {
        expect(safePublicErrorMessage(new Error(message), DEFAULT_UNKNOWN_ERROR_CODE)).toBe(
          GENERIC_ERROR_MESSAGE,
        );
      }),
    );
  });
});
