import { auditEventId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import {
  validateOperationIntentCode,
  validateOperationProgress,
  validateOperationProgressInput,
} from "../src/validate-operation-metadata.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");

function expectInvalidMetadata(run: () => void, message: RegExp): void {
  try {
    run();
    expect.fail("Expected invalid metadata validation to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(OperationStoreError);
    expect(error).toMatchObject({
      code: OPERATION_ERROR_CODES.invalidMetadata,
    });
    expect(error).toMatchObject({ message: expect.stringMatching(message) });
  }
}

describe("validateOperationProgress branches", () => {
  it("rejects malformed audit event ids", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          auditEventIds: ["not-an-audit-id"],
        }),
      /auditEventIds must contain audit event opaque IDs/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          auditEventIds: [123 as never],
        }),
      /auditEventIds must contain audit event opaque IDs/,
    );
  });

  it("rejects non-integer counter values", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          counters: { step: 1.5 },
        }),
      /counters.step must be a non-negative integer/,
    );
  });

  it("rejects invalid wait metadata", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          wait: { reasonCode: "NOT_DOTTED" as never },
        }),
      /wait.reasonCode must be a stable dotted code/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          wait: { reasonCode: "auth.reauth_required", until: "not-a-date" },
        }),
      /wait.until must be an ISO-8601 timestamp/,
    );
  });

  it("rejects invalid retry metadata", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          retry: { attempt: -1 },
        }),
      /retry.attempt must be a non-negative integer/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          retry: { attempt: 1, reasonCode: "BAD" as never },
        }),
      /retry.reasonCode must be a stable dotted code/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          retry: { attempt: 1, nextRetryAt: "soon" },
        }),
      /retry.nextRetryAt must be an ISO-8601 timestamp/,
    );
  });

  it("rejects invalid optional result and provider codes", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          providerStatusCode: "SYNC_BUSY" as never,
        }),
      /providerStatusCode must be a stable dotted code/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          resultCode: "FAILED" as never,
        }),
      /resultCode must be a stable dotted code/,
    );
  });

  it("rejects unknown progress fields and free-form string values", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          smuggled: "arbitrary secret text",
        } as never),
      /progress contains unknown field: smuggled/,
    );
  });

  it("rejects invalid mutation idempotency keys", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          mutationIdempotencyKey: "",
        }),
      /mutationIdempotencyKey must be a 1-256 character opaque token/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          mutationIdempotencyKey: "arbitrary secret text",
        }),
      /mutationIdempotencyKey must be a 1-256 character opaque token/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          mutationIdempotencyKey: "x".repeat(257),
        }),
      /mutationIdempotencyKey must be a 1-256 character opaque token/,
    );
  });

  it("rejects unknown incomplete causes and non-boolean abandoned flags", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          cause: "unknown" as never,
        }),
      /cause must be retryable or action_required/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          abandoned: "yes" as never,
        }),
      /abandoned must be a boolean/,
    );
  });

  it("validates syncTargetLease fencing tokens and provider kinds", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          syncTargetLease: {
            projectId: PRJ,
            providerKind: "github-actions",
            targetIdentity: "acme/widget",
            fencingToken: 0,
          },
        }),
      /fencingToken must be a positive integer/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgress({
          syncTargetLease: {
            projectId: PRJ,
            providerKind: "unknown-provider" as never,
            targetIdentity: "acme/widget",
            fencingToken: 1,
          },
        }),
      /syncTargetLease.providerKind must be a supported sync provider kind/,
    );
  });

  it("validates syncTargetLease target identity when organizationId is provided", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgress(
          {
            syncTargetLease: {
              projectId: PRJ,
              providerKind: "github-actions",
              targetIdentity: "",
              fencingToken: 1,
            },
          },
          ORG,
        ),
      /targetIdentity must be 1-512 non-empty characters/,
    );
  });

  it("accepts a fully populated metadata-safe progress payload", () => {
    expect(() =>
      validateOperationProgress(
        {
          auditEventIds: [auditEventId.brand("aud_00000000000000000000000001")],
          counters: { bindingsTotal: 2, bindingsSucceeded: 1 },
          providerStatusCode: "sync.target_busy",
          resultCode: "sync.partial_failure",
          mutationIdempotencyKey: "idem-1",
          cause: "action_required",
          wait: {
            reasonCode: "auth.high_assurance_required",
            until: "2026-01-01T01:00:00.000Z",
          },
          retry: {
            attempt: 1,
            reasonCode: "sync.target_busy",
            nextRetryAt: "2026-01-01T00:05:00.000Z",
          },
          syncTargetLease: {
            projectId: PRJ,
            providerKind: "github-actions",
            targetIdentity: "acme/widget",
            fencingToken: 1,
          },
        },
        ORG,
      ),
    ).not.toThrow();
  });
});

describe("validateOperationProgressInput", () => {
  it("rejects caller-owned syncTargetLease and abandoned fields", () => {
    expectInvalidMetadata(
      () =>
        validateOperationProgressInput({
          syncTargetLease: {
            projectId: PRJ,
            providerKind: "github-actions",
            targetIdentity: "acme/widget",
            fencingToken: 1,
          },
        }),
      /syncTargetLease is owned by sync target lease claim and release APIs/,
    );

    expectInvalidMetadata(
      () =>
        validateOperationProgressInput({
          abandoned: true,
        }),
      /abandoned is owned by operation liveness recovery/,
    );
  });
});

describe("validateOperationIntentCode branches", () => {
  it("rejects intent codes that are not stable dotted codes", () => {
    expect(() => validateOperationIntentCode("SYNC_RUN")).toThrow(OperationStoreError);
    try {
      validateOperationIntentCode("SYNC_RUN");
    } catch (error) {
      expect(error).toMatchObject({
        code: OPERATION_ERROR_CODES.invalidIntent,
        message: "intentCode must be a stable dotted code (e.g. sync.run)",
      });
    }
  });

  it("accepts every registered intent code from OPERATION_INTENT_CODES", () => {
    for (const intentCode of Object.values(OPERATION_INTENT_CODES)) {
      expect(() => validateOperationIntentCode(intentCode)).not.toThrow();
    }
  });

  it("rejects unknown registered-shape intent codes", () => {
    expect(() => validateOperationIntentCode("sync.unknown_intent")).toThrow(OperationStoreError);
    try {
      validateOperationIntentCode("sync.unknown_intent");
    } catch (error) {
      expect(error).toMatchObject({
        code: OPERATION_ERROR_CODES.invalidIntent,
      });
    }
  });
});
