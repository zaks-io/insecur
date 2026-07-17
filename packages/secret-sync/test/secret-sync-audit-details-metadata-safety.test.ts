import { PRODUCTION_AUDIT_EVENT_CODES, validateAuditEventInput } from "@insecur/audit";
import { PROVIDER_ERROR_CODES, operationId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { PROVIDER_LOOKUP_STATUSES } from "../src/provider-lookup-port.js";
import { PROVIDER_WRITE_STATUSES } from "../src/provider-sync-write-port.js";
import { secretSyncResource } from "../src/record-secret-sync-audit.js";
import { toPlanBindingAuditDetails } from "../src/record-secret-sync-plan-audit.js";
import { toRunBindingAuditDetails } from "../src/record-secret-sync-run-audit.js";
import { syncDeployImpact, type SecretSyncPlan } from "../src/secret-sync-plan.js";
import {
  BINDING,
  CONN,
  ENV,
  ORG,
  PROJECT,
  SECRET,
  SYNC,
  USER,
} from "./helpers/secret-sync-test-fixtures.js";

const OPERATION = operationId.brand("op_00000000000000000000000001");

/**
 * Guards the ADR-0068 contract with the REAL audit validation layer (no
 * mocks): every Cloudflare sync audit detail map — including the
 * `deployImpact` label — must pass `validateAuditEventInput`, whose
 * `assertMetadataSafeDetailMap` rejects any string that is neither a stable
 * dotted code nor an opaque resource id. The engine-level run tests mock
 * `writeAuditEvent`, so this suite is what proves the details survive the
 * real writer.
 */

const CLOUDFLARE_PLAN: SecretSyncPlan = {
  secretSyncId: SYNC,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  appConnectionId: CONN,
  kind: "cloudflare-worker-secret",
  connectionStatus: "active",
  plannedAt: "2026-01-01T00:00:00.000Z",
  bindings: [
    {
      bindingId: BINDING,
      secretId: SECRET,
      lookupStatus: PROVIDER_LOOKUP_STATUSES.found,
      targetExistence: "provider_target.exists",
      permissionStatus: "provider_permission.granted",
      overwriteWarning: true,
    },
  ],
  overwriteWarningCount: 1,
  warningCodes: [],
  deployImpact: syncDeployImpact("cloudflare-worker-secret"),
  fingerprint: "0f".repeat(32),
};

const RUN_RECORDS = [
  { bindingId: BINDING, secretId: SECRET, writeStatus: PROVIDER_WRITE_STATUSES.written },
] as const;
const RUN_COUNTERS = { totalBindings: 1, writtenCount: 1, failedCount: 0, verifiedCount: 1 };

const EVENT_SCOPE = {
  actor: { type: "user", userId: USER },
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  resource: secretSyncResource(SYNC),
} as const;

describe("cloudflare sync audit details pass the real audit validation layer", () => {
  it("accepts the sync plan completed details including deployImpact", () => {
    expect(() =>
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncPlanCompleted,
        outcome: "success",
        ...EVENT_SCOPE,
        details: toPlanBindingAuditDetails(CLOUDFLARE_PLAN),
      }),
    ).not.toThrow();
  });

  it("accepts the sync run completed details including deployImpact", () => {
    expect(() =>
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
        outcome: "success",
        ...EVENT_SCOPE,
        operation: { operationId: OPERATION },
        details: toRunBindingAuditDetails(RUN_RECORDS, RUN_COUNTERS, "cloudflare-worker-secret"),
      }),
    ).not.toThrow();
  });

  it("accepts the sync run denied details including deployImpact", () => {
    expect(() =>
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied,
        outcome: "denied",
        ...EVENT_SCOPE,
        operation: { operationId: OPERATION },
        denial: { reasonCode: PROVIDER_ERROR_CODES.unavailable },
        details: toRunBindingAuditDetails(
          [{ ...RUN_RECORDS[0], writeStatus: PROVIDER_WRITE_STATUSES.retryableUnavailable }],
          { totalBindings: 1, writtenCount: 0, failedCount: 1, verifiedCount: 0 },
          "cloudflare-worker-secret",
        ),
      }),
    ).not.toThrow();
  });

  it("would reject the bare undotted vocabulary token (regression guard)", () => {
    expect(() =>
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
        outcome: "success",
        ...EVENT_SCOPE,
        operation: { operationId: OPERATION },
        details: { deployImpact: "cloudflare_worker_secret_deploy" },
      }),
    ).toThrowError(/metadata-safe|stable dotted|opaque/i);
  });
});
