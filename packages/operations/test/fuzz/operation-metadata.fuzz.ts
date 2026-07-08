import { auditEventId, organizationId } from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { OPERATION_INTENT_CODES, isOperationIntentCode } from "../../src/operation-intent-codes.js";
import {
  OPERATION_STATES,
  TERMINAL_OPERATION_STATES,
  isTransitionAllowed,
} from "../../src/operation-states.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../../src/operation-errors.js";
import {
  validateOperationIntentCode,
  validateOperationProgress,
} from "../../src/validate-operation-metadata.js";
import type { OperationProgress } from "../../src/operation-types.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const TOKEN_HEAD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_TAIL_CHARS = `${TOKEN_HEAD_CHARS}_.-`;
const KNOWN_PROGRESS_KEYS = [
  "auditEventIds",
  "wait",
  "retry",
  "counters",
  "providerStatusCode",
  "resultCode",
  "mutationIdempotencyKey",
  "cause",
  "syncTargetLease",
  "abandoned",
  "highAssuranceChallenge",
] as const;

const operationStateArb = fc.constantFrom(...OPERATION_STATES);
const intentCodeArb = fc.constantFrom(...Object.values(OPERATION_INTENT_CODES));
const auditEventIdArb = fc
  .array(fc.integer({ min: 0, max: 35 }), { minLength: 26, maxLength: 26 })
  .map((digits) =>
    auditEventId.brand(`aud_${digits.map((digit) => digit.toString(36).toUpperCase()).join("")}`),
  );
const metadataSafeOpaqueTokenArb = fc
  .tuple(
    fc.constantFrom(...TOKEN_HEAD_CHARS.split("")),
    fc.array(fc.constantFrom(...TOKEN_TAIL_CHARS.split("")), { maxLength: 63 }),
  )
  .map(([head, tail]) => `${head}${tail.join("")}`);
const unknownProgressKeyArb = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,23}$/)
  .filter((key) => !(KNOWN_PROGRESS_KEYS as readonly string[]).includes(key));
const validProgressArb: fc.Arbitrary<OperationProgress> = fc
  .record({
    auditEventIds: fc.array(auditEventIdArb, { maxLength: 8 }),
    counters: fc.record({
      changed: fc.nat(1_000),
      total: fc.nat(1_000),
    }),
    resultCode: fc.option(fc.constantFrom("sync.succeeded", "sync.partial_failure"), {
      nil: undefined,
    }),
    mutationIdempotencyKey: fc.option(metadataSafeOpaqueTokenArb, { nil: undefined }),
  })
  .map(
    (progress) =>
      Object.fromEntries(
        Object.entries(progress).filter(([, value]) => value !== undefined),
      ) as OperationProgress,
  );

function expectInvalidMetadata(fn: () => unknown): void {
  expect(fn).toThrow(OperationStoreError);
  expect(fn).toThrow(expect.objectContaining({ code: OPERATION_ERROR_CODES.invalidMetadata }));
}

describe("operation state and metadata fuzz", () => {
  it("keeps terminal states immobile and every state self-transition idempotent", () => {
    fc.assert(
      fc.property(operationStateArb, operationStateArb, (current, next) => {
        if (current === next) {
          expect(isTransitionAllowed(current, next)).toBe(true);
          return;
        }
        if (TERMINAL_OPERATION_STATES.has(current)) {
          expect(isTransitionAllowed(current, next)).toBe(false);
        }
      }),
    );
  });

  it("validates only registered operation intent codes", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 96 }), intentCodeArb), (intentCode) => {
        if (isOperationIntentCode(intentCode)) {
          expect(() => validateOperationIntentCode(intentCode)).not.toThrow();
          return;
        }

        expect(() => validateOperationIntentCode(intentCode)).toThrow(OperationStoreError);
      }),
    );
  });

  it("accepts generated metadata-safe progress and rejects unknown free-form fields", () => {
    fc.assert(
      fc.property(validProgressArb, unknownProgressKeyArb, (progress, key) => {
        expect(() => validateOperationProgress(progress, ORG)).not.toThrow();
        expectInvalidMetadata(() =>
          validateOperationProgress({ ...progress, [key]: "arbitrary secret text" }, ORG),
        );
      }),
      {
        examples: [
          [
            {
              auditEventIds: [auditEventId.brand("aud_00000000000000000000000001")],
              counters: { changed: 1, total: 1 },
              resultCode: "sync.succeeded",
              mutationIdempotencyKey: "idem-1",
            },
            "smuggled",
          ],
        ],
      },
    );
  });
});
