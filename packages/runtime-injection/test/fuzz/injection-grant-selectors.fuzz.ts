import {
  INJECTION_ERROR_CODES,
  parseVariableKey,
  runtimePolicyId,
  secretId,
  secretVersionId,
  type VariableKey,
} from "@insecur/domain";
import type { ResolvedInjectionGrantBinding } from "@insecur/tenant-store";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { InjectionGrantError } from "../../src/injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  issueSelectorBindingCount,
  normalizeConsumeSelector,
  type InjectionGrantConsumeSelector,
  type InjectionGrantIssueSelector,
} from "../../src/injection-grant-selectors.js";
import { matchConsumeSelectorToBinding } from "../../src/match-consume-selector.js";

function tupleFromChars(chars: string): [string, ...string[]] {
  const [first, ...rest] = chars.split("");
  if (first === undefined) {
    throw new Error("character tuple requires at least one value");
  }
  return [first, ...rest];
}

function parseGeneratedVariableKey(raw: string): VariableKey {
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw new Error(`Generated invalid variable key: ${raw}`);
  }
  return parsed.value;
}

const variableKeyArb = fc
  .tuple(
    fc.constantFrom(...tupleFromChars("ABCDEFGHIJKLMNOPQRSTUVWXYZ_")),
    fc.array(fc.constantFrom(...tupleFromChars("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")), {
      maxLength: 63,
    }),
  )
  .map(([head, tail]) => parseGeneratedVariableKey(`${head}${tail.join("")}`));
const opaqueBodyArb = fc
  .array(
    fc.integer({ min: 0, max: 35 }).map((index) => index.toString(36).toUpperCase()),
    {
      minLength: 26,
      maxLength: 26,
    },
  )
  .map((chars) => chars.join(""));
const secretIdArb = opaqueBodyArb.map((body) => secretId.brand(`sec_${body}`));
const secretVersionIdArb = opaqueBodyArb.map((body) => secretVersionId.brand(`sv_${body}`));
const runtimePolicyIdArb = opaqueBodyArb.map((body) => runtimePolicyId.brand(`rp_${body}`));
const bindingArb = fc.record({
  secretId: secretIdArb,
  secretVersionId: secretVersionIdArb,
  variableKey: variableKeyArb,
});
const consumeSelectorInputArb = fc.record({
  variableKey: fc.option(variableKeyArb, { nil: undefined }),
  secretId: fc.option(secretIdArb, { nil: undefined }),
});
const issueSelectorArb: fc.Arbitrary<InjectionGrantIssueSelector> = fc.oneof(
  variableKeyArb.map((variableKey): InjectionGrantIssueSelector => ({
    kind: "variable_key",
    variableKey,
  })),
  secretIdArb.map((secretIdValue): InjectionGrantIssueSelector => ({
    kind: "secret_id",
    secretId: secretIdValue,
  })),
  runtimePolicyIdArb.map((policyId): InjectionGrantIssueSelector => ({
    kind: "policy_id",
    policyId,
  })),
);

function expectGrantDenied(fn: () => unknown): void {
  expect(fn).toThrow(InjectionGrantError);
  expect(fn).toThrow(expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }));
}

function selectorForBinding(
  binding: ResolvedInjectionGrantBinding,
  useSecretId: boolean,
): InjectionGrantConsumeSelector {
  return useSecretId
    ? { kind: "secret_id", secretId: binding.secretId }
    : { kind: "variable_key", variableKey: binding.variableKey };
}

describe("runtime injection selector fuzz", () => {
  it("normalizes consume selectors only when exactly one binding key is present", () => {
    fc.assert(
      fc.property(consumeSelectorInputArb, (input) => {
        const hasVariableKey = input.variableKey !== undefined;
        const hasSecretId = input.secretId !== undefined;

        if (hasVariableKey === hasSecretId) {
          expectGrantDenied(() => normalizeConsumeSelector(input));
          return;
        }

        expect(normalizeConsumeSelector(input)).toEqual(
          hasSecretId
            ? { kind: "secret_id", secretId: input.secretId }
            : { kind: "variable_key", variableKey: input.variableKey },
        );
      }),
      {
        examples: [
          [{}],
          [{ variableKey: parseGeneratedVariableKey("API_KEY") }],
          [{ secretId: secretId.brand("sec_01TEST00000000000000000001") }],
          [
            {
              variableKey: parseGeneratedVariableKey("API_KEY"),
              secretId: secretId.brand("sec_01TEST00000000000000000001"),
            },
          ],
        ],
      },
    );
  });

  it("keeps selector binding counts stable for generated issue selectors", () => {
    fc.assert(
      fc.property(issueSelectorArb, (selector) => {
        const count = issueSelectorBindingCount(selector);

        if (selector.kind === "policy_id") {
          expect(count).toBe(-1);
          return;
        }

        expect(count).toBe(1);
        expect(() => assertSingleIssueSelectorCount(selector)).not.toThrow();
      }),
    );
  });

  it("matches consume selectors to their bound secret exactly", () => {
    fc.assert(
      fc.property(bindingArb, fc.boolean(), (binding, useSecretId) => {
        const selector = selectorForBinding(binding, useSecretId);

        expect(matchConsumeSelectorToBinding(selector, binding)).toEqual({
          secretId: binding.secretId,
          variableKey: binding.variableKey,
        });
      }),
    );
  });
});
