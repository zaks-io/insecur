import { resolveEffectiveAccess } from "@insecur/access";
import {
  brandOpaqueResourceIdForPrefix,
  parseDisplayName,
  runtimePolicyId,
  runtimePolicyVersionId,
  type DisplayName,
  type VariableKey,
} from "@insecur/domain";
import { RUNTIME_INJECTION_DELIVERY_MODES, withTenantScope } from "@insecur/tenant-store";
import { expect, it } from "vitest";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { createAuthorizedRuntimeInjectionPolicy } from "../src/runtime-injection-policies.js";
import { consumeInjectionGrantAll, issueInjectionGrant } from "../src/injection-grants.js";
import {
  describeInjectionGrantIntegration,
  loadAuditRow,
  loadGrantBinding,
} from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

const POLICY_ID = "rp_00000000000000000000000011";
const VERSION_ID = "rpv_00000000000000000000000011";

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

describeInjectionGrantIntegration("Runtime Injection Grant policy consume-all", () => {
  it("issues a policy-backed grant and consumes all bindings once", async () => {
    const org = testOrganization();
    const project = testProject();
    const environment = testEnvironment();
    const actor = testActor();
    const ownerAccess = await resolveEffectiveAccess(actor, {
      organizationId: org,
      projectId: project,
      environmentId: environment,
    });
    const accessCoordinate = {
      organizationId: org,
      projectId: project,
      environmentId: environment,
    };

    const keyA: VariableKey = uniqueVariableKey("RID03_A");
    const keyB: VariableKey = uniqueVariableKey("RID03_B");
    const plaintextA = new TextEncoder().encode(`rid03-a-${crypto.randomUUID()}`);
    const plaintextB = new TextEncoder().encode(`rid03-b-${crypto.randomUUID()}`);
    const writtenA = await writeTestSecret(keyA, plaintextA);
    const writtenB = await writeTestSecret(keyB, plaintextB);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${POLICY_ID}`;
      await sql`DELETE FROM runtime_injection_policies WHERE id = ${POLICY_ID}`;
    });

    await createAuthorizedRuntimeInjectionPolicy({
      organizationId: org,
      projectId: project,
      environmentId: environment,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_ID),
      displayName: displayName("RID03 Policy"),
      version: {
        secretIds: [],
        variableKeys: [keyA, keyB],
        command: "npm test",
        ttlSeconds: 300,
        deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
      },
      effectiveAccess: ownerAccess,
      accessCoordinate,
    });

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: project,
      environmentId: environment,
      selector: { kind: "policy_id", policyId: runtimePolicyId.brand(POLICY_ID) },
      actor,
    });

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.policy_id).toBe(POLICY_ID);
    expect(stored?.secret_ids.sort()).toEqual([writtenA.secretId, writtenB.secretId].sort());
    expect(stored?.variable_keys.sort()).toEqual([keyA, keyB].sort());

    const consumed = await consumeInjectionGrantAll({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      actor,
    });

    expect(consumed.entries).toHaveLength(2);
    const byKey = new Map(consumed.entries.map((entry) => [entry.variableKey, entry]));
    const entryA = byKey.get(keyA);
    const entryB = byKey.get(keyB);
    if (entryA === undefined || entryB === undefined) {
      throw new Error("expected both policy bindings in consume-all result");
    }
    expect(new TextDecoder().decode(entryA.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintextA),
    );
    expect(new TextDecoder().decode(entryB.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintextB),
    );
    expect(JSON.stringify(consumed.entries.map((entry) => entry.variableKey))).not.toContain(
      new TextDecoder().decode(plaintextA),
    );

    const consumeAuditEventId = consumed.auditEventId;
    if (consumeAuditEventId === undefined) {
      throw new Error("expected consume audit event id");
    }
    const consumeAudit = await loadAuditRow(org, consumeAuditEventId);
    expect(consumeAudit?.event_code).toBe("runtime_injection.grant_consumed");
    expect(consumeAudit?.resource_id).toBe(brandOpaqueResourceIdForPrefix("igr", issued.grantId));
    expect(JSON.stringify(consumeAudit)).not.toContain(new TextDecoder().decode(plaintextA));
  });
});
