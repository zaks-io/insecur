import { auditEventId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import {
  validateOperationIntentCode,
  validateOperationProgress,
} from "../src/validate-operation-metadata.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");

describe("validateOperationProgress branches", () => {
  it("rejects malformed audit event ids", () => {
    expect(() =>
      validateOperationProgress({
        auditEventIds: ["not-an-audit-id"],
      }),
    ).toThrow(/auditEventIds must contain audit event opaque IDs/);
  });

  it("rejects invalid wait metadata", () => {
    expect(() =>
      validateOperationProgress({
        wait: { reasonCode: "NOT_DOTTED" as never },
      }),
    ).toThrow(/wait.reasonCode must be a stable dotted code/);

    expect(() =>
      validateOperationProgress({
        wait: { reasonCode: "auth.reauth_required", until: "not-a-date" },
      }),
    ).toThrow(/wait.until must be an ISO-8601 timestamp/);
  });

  it("rejects invalid retry metadata", () => {
    expect(() =>
      validateOperationProgress({
        retry: { attempt: -1 },
      }),
    ).toThrow(/retry.attempt must be a non-negative integer/);

    expect(() =>
      validateOperationProgress({
        retry: { attempt: 1, reasonCode: "BAD" as never },
      }),
    ).toThrow(/retry.reasonCode must be a stable dotted code/);

    expect(() =>
      validateOperationProgress({
        retry: { attempt: 1, nextRetryAt: "soon" },
      }),
    ).toThrow(/retry.nextRetryAt must be an ISO-8601 timestamp/);
  });

  it("rejects invalid optional result and provider codes", () => {
    expect(() =>
      validateOperationProgress({
        providerStatusCode: "SYNC_BUSY" as never,
      }),
    ).toThrow(/providerStatusCode must be a stable dotted code/);

    expect(() =>
      validateOperationProgress({
        resultCode: "FAILED" as never,
      }),
    ).toThrow(/resultCode must be a stable dotted code/);
  });

  it("rejects invalid mutation idempotency keys", () => {
    expect(() =>
      validateOperationProgress({
        mutationIdempotencyKey: "",
      }),
    ).toThrow(/mutationIdempotencyKey must be 1-256 characters/);

    expect(() =>
      validateOperationProgress({
        mutationIdempotencyKey: "x".repeat(257),
      }),
    ).toThrow(/mutationIdempotencyKey must be 1-256 characters/);
  });

  it("rejects unknown incomplete causes and non-boolean abandoned flags", () => {
    expect(() =>
      validateOperationProgress({
        cause: "unknown" as never,
      }),
    ).toThrow(/cause must be retryable or action_required/);

    expect(() =>
      validateOperationProgress({
        abandoned: "yes" as never,
      }),
    ).toThrow(/abandoned must be a boolean/);
  });

  it("validates syncTargetLease fencing tokens and provider kinds", () => {
    expect(() =>
      validateOperationProgress({
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 0,
        },
      }),
    ).toThrow(/fencingToken must be a positive integer/);

    expect(() =>
      validateOperationProgress({
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "unknown-provider" as never,
          targetIdentity: "acme/widget",
          fencingToken: 1,
        },
      }),
    ).toThrow(/syncTargetLease.providerKind must be a supported sync provider kind/);
  });

  it("validates syncTargetLease target identity when organizationId is provided", () => {
    expect(() =>
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
    ).toThrow(/targetIdentity must be 1-512 non-empty characters/);
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

describe("validateOperationIntentCode branches", () => {
  it("accepts registered intent codes", () => {
    expect(() => validateOperationIntentCode("sync.run")).not.toThrow();
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
