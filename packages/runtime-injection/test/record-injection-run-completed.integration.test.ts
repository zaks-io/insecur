import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type InjectionGrantId,
  type OrganizationId,
} from "@insecur/domain";
import { expect, it } from "vitest";
import { withTenantScope } from "@insecur/tenant-store";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import {
  consumeInjectionGrant,
  issueInjectionGrant,
  recordInjectionRunCompleted,
} from "../src/injection-grants.js";
import {
  describeInjectionGrantIntegration,
  loadAuditRow,
} from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

describeInjectionGrantIntegration("Runtime Injection run completion telemetry", () => {
  it("records run completion once per grant and accepts large host exit codes", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV_RUN_DONE");
    await writeTestSecret(variableKey, new TextEncoder().encode(`run-done-${crypto.randomUUID()}`));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    const windowsExitCode = 3221226505;
    const first = await recordInjectionRunCompleted({
      organizationId: org,
      grantId: issued.grantId,
      childExitCode: windowsExitCode,
      actor: testActor(),
    });
    expect(first.alreadyRecorded).toBe(false);

    const second = await recordInjectionRunCompleted({
      organizationId: org,
      grantId: issued.grantId,
      childExitCode: windowsExitCode,
      actor: testActor(),
    });
    expect(second.alreadyRecorded).toBe(true);
    expect(second.auditEventId).toBe(first.auditEventId);

    const audit = await loadAuditRow(org, first.auditEventId);
    expect(audit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted);
    expect(audit?.details).toEqual({ childExitCode: windowsExitCode });

    const duplicateCount = await countRunCompletedAuditEvents(org, issued.grantId);
    expect(duplicateCount).toBe(1);
  });

  it("serializes concurrent run completion recording for the same grant", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV_RUN_DONE_RACE");
    await writeTestSecret(variableKey, new TextEncoder().encode(`run-race-${crypto.randomUUID()}`));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    const [left, right] = await Promise.all([
      recordInjectionRunCompleted({
        organizationId: org,
        grantId: issued.grantId,
        childExitCode: 17,
        actor: testActor(),
      }),
      recordInjectionRunCompleted({
        organizationId: org,
        grantId: issued.grantId,
        childExitCode: 17,
        actor: testActor(),
      }),
    ]);

    expect([left.alreadyRecorded, right.alreadyRecorded].sort()).toEqual([false, true]);
    expect(left.auditEventId).toBe(right.auditEventId);

    const duplicateCount = await countRunCompletedAuditEvents(org, issued.grantId);
    expect(duplicateCount).toBe(1);
  });
});

async function countRunCompletedAuditEvents(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<number> {
  const grantResourceId = brandOpaqueResourceIdForPrefix("igr", grantId);

  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const rows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM audit_events
      WHERE org_id = ${organizationId}
        AND event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted}
        AND resource_id = ${grantResourceId}
    `;
    return Number(rows[0]?.count ?? "0");
  });
}
