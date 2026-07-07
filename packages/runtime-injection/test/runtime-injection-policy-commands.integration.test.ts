import {
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  runtimePolicyId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { HighAssuranceHandoffError } from "@insecur/high-assurance";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";

import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_SECRET_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { createRuntimeInjectionPolicyCommand } from "../src/create-runtime-injection-policy-command.js";
import { disableRuntimeInjectionPolicyCommand } from "../src/runtime-injection-policy-commands.js";
import { getRuntimeInjectionPolicyShow } from "../src/runtime-injection-policy-commands.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as gateModule from "../src/gate-protected-runtime-injection-policy-change.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);
const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const REQ = requestId.brand("req_00000000000000000000000001");

const POLICY_ID = "rp_00000000000000000000000010";
const POLICY_ID_TWO = "rp_00000000000000000000000011";

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function cleanupPolicies(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    for (const policyId of [POLICY_ID, POLICY_ID_TWO]) {
      await sql`UPDATE runtime_injection_policies SET active_version_id = NULL WHERE id = ${policyId}`;
      await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${policyId}`;
      await sql`DELETE FROM runtime_injection_policies WHERE id = ${policyId}`;
    }
  });
}

describeIntegration("runtime injection policy commands (INS-437)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupPolicies();
  });

  afterAll(async () => {
    await cleanupPolicies();
    await closeRuntimeSql();
  });

  it("creates a policy version with exact bindings and records audit metadata", async () => {
    const created = await createRuntimeInjectionPolicyCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      displayName: displayName("migration"),
      command: "npm run deploy",
      commandFingerprint: "sha256:fixture",
      secretIds: [TEST_SECRET_A_ID],
      requestId: REQ,
    });

    expect(created.activeVersion.secretIds).toEqual([TEST_SECRET_A_ID]);
    expect(created.activeVersion.variableKeys).toEqual([]);
    expect(created.auditEventId).toMatch(/^aud_/);

    const shown = await getRuntimeInjectionPolicyShow({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
    });
    expect(shown.activeVersion?.policyVersionId).toBe(created.policyVersionId);
    expect(shown.activeVersion?.command).toBe("npm run deploy");
  });

  it("disables a policy with audited metadata-only outcome", async () => {
    const disabled = await disableRuntimeInjectionPolicyCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      comment: "retire migration flow",
      requestId: REQ,
    });

    expect(disabled.policyId).toBe(runtimePolicyId.brand(POLICY_ID));
    expect(disabled.auditEventId).toMatch(/^aud_/);

    const shown = await getRuntimeInjectionPolicyShow({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
    });
    expect(shown.disabledAt).not.toBeNull();
  });

  it("fail-closes protected policy create without high-assurance evidence", async () => {
    const gateSpy = vi
      .spyOn(gateModule, "gateProtectedRuntimeInjectionPolicyChange")
      .mockRejectedValueOnce(
        new HighAssuranceHandoffError("op_00000000000000000000000099" as never),
      );

    await expect(
      createRuntimeInjectionPolicyCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand(POLICY_ID_TWO),
        displayName: displayName("preview-deploy"),
        command: "npm run deploy",
        secretIds: [TEST_SECRET_A_ID],
        requestId: REQ,
      }),
    ).rejects.toBeInstanceOf(HighAssuranceHandoffError);

    gateSpy.mockRestore();
  });
});
