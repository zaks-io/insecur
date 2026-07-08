import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  INJECTION_ERROR_CODES,
  RUNTIME_POLICY_ERROR_CODES,
  STORAGE_GATE_ERROR_CODES,
  runtimePolicyId,
  runtimePolicyVersionId,
  type DisplayName,
  type VariableKey,
} from "@insecur/domain";
import { PRODUCTION_DELIVERY_PATHS } from "@insecur/storage-security-gate";
import { RUNTIME_INJECTION_DELIVERY_MODES, withTenantScope } from "@insecur/tenant-store";
import { expect, it } from "vitest";
import { resolveEffectiveAccess } from "@insecur/access";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { testDisplayName } from "../../secret-store/test/test-display-name.js";
import { createAuthorizedRuntimeInjectionPolicy } from "../src/runtime-injection-policies.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
import {
  deleteProtectedPreviewEnvironment,
  describeInjectionGrantIntegration,
  loadLatestIssueDeniedAudit,
  recreateProtectedPreviewEnvironment,
} from "./injection-grant-integration-helpers.js";
import {
  createBlockedProductionGateEvaluator,
  createPassedProductionGateEvaluator,
} from "./gate-test-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

const POLICY_ID = "rp_00000000000000000000000065";
const VERSION_ID = "rpv_00000000000000000000000065";

function productionGateInput(
  coordinate: {
    organizationId: ReturnType<typeof testOrganization>;
    projectId: ReturnType<typeof testProject>;
    environmentId: ReturnType<typeof testEnvironment>;
  },
  gateStatus: "passed" | "blocked",
) {
  return {
    deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
    evaluateStorageSecurityGate:
      gateStatus === "passed"
        ? createPassedProductionGateEvaluator()
        : createBlockedProductionGateEvaluator(),
    ...coordinate,
  };
}

describeInjectionGrantIntegration("Production Runtime Injection gate enforcement", () => {
  it("denies protected-environment issue when the storage security gate is blocked", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("RID04_GATE_BLOCKED");
    const protectedEnvironmentId = await recreateProtectedPreviewEnvironment({
      organizationId: org,
      projectId: testProject(),
      displayName: testDisplayName("Protected gate blocked"),
    });

    try {
      await writeTestSecret(variableKey, new TextEncoder().encode("gate-blocked"), {
        organizationId: org,
        projectId: testProject(),
        environmentId: protectedEnvironmentId,
      });

      await expect(
        issueInjectionGrant({
          ...productionGateInput(
            {
              organizationId: org,
              projectId: testProject(),
              environmentId: protectedEnvironmentId,
            },
            "blocked",
          ),
          selector: { kind: "variable_key", variableKey },
          actor: testActor(),
        }),
      ).rejects.toMatchObject({ code: STORAGE_GATE_ERROR_CODES.gateBlocked });

      const deniedAudit = await loadLatestIssueDeniedAudit(org);
      expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
      expect(deniedAudit?.outcome).toBe("denied");
      expect(deniedAudit?.result_code).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
    } finally {
      await deleteProtectedPreviewEnvironment(org);
    }
  });

  it("denies protected-environment issue for human sessions on the production delivery path", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("RID04_HUMAN_DENIED");
    const protectedEnvironmentId = await recreateProtectedPreviewEnvironment({
      organizationId: org,
      projectId: testProject(),
      displayName: testDisplayName("Protected human denied"),
    });

    try {
      await writeTestSecret(variableKey, new TextEncoder().encode("human-denied"), {
        organizationId: org,
        projectId: testProject(),
        environmentId: protectedEnvironmentId,
      });

      await expect(
        issueInjectionGrant({
          ...productionGateInput(
            {
              organizationId: org,
              projectId: testProject(),
              environmentId: protectedEnvironmentId,
            },
            "passed",
          ),
          selector: { kind: "variable_key", variableKey },
          actor: testActor(),
        }),
      ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked });

      const deniedAudit = await loadLatestIssueDeniedAudit(org);
      expect(deniedAudit?.result_code).toBe(RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked);
    } finally {
      await deleteProtectedPreviewEnvironment(org);
    }
  });

  it("denies issue when the runtime injection policy is disabled", async () => {
    const org = testOrganization();
    const project = testProject();
    const environment = testEnvironment();
    const actor = testActor();
    const ownerAccess = await resolveEffectiveAccess(actor, {
      organizationId: org,
      projectId: project,
      environmentId: environment,
    });
    const key: VariableKey = uniqueVariableKey("RID04_WRONG_POLICY");
    const written = await writeTestSecret(key, new TextEncoder().encode("wrong-policy"));

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`UPDATE runtime_injection_policies SET active_version_id = NULL WHERE id = ${POLICY_ID}`;
      await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${POLICY_ID}`;
      await sql`DELETE FROM runtime_injection_policies WHERE id = ${POLICY_ID}`;
    });

    await createAuthorizedRuntimeInjectionPolicy({
      organizationId: org,
      projectId: project,
      environmentId: environment,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_ID),
      displayName: testDisplayName("RID04 disabled policy") as DisplayName,
      version: {
        secretIds: [written.secretId],
        variableKeys: [],
        command: "npm test",
        ttlSeconds: 300,
        deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
      },
      effectiveAccess: ownerAccess,
      accessCoordinate: { organizationId: org, projectId: project, environmentId: environment },
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE runtime_injection_policies
        SET disabled_at = now()
        WHERE id = ${POLICY_ID}
      `;
    });

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: project,
        environmentId: environment,
        selector: { kind: "policy_id", policyId: runtimePolicyId.brand(POLICY_ID) },
        actor,
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.disabled });
  });

  it("denies consume for a stale grant on the production delivery path", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("RID04_STALE_GRANT");
    await writeTestSecret(variableKey, new TextEncoder().encode("stale-grant"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE injection_grants
        SET expires_at = now() - interval '1 second'
        WHERE id = ${issued.grantId}
      `;
    });

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
        deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
        evaluateStorageSecurityGate: createPassedProductionGateEvaluator(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantExpired });
  });

  it("never issues grants for draft-only secret versions", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("RID04_DRAFT_ONLY");
    const written = await writeTestSecret(variableKey, new TextEncoder().encode("draft-only"));

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE secret_versions
        SET lifecycle_state = 'draft', published_at = NULL
        WHERE id = ${written.secretVersionId}
      `;
      await sql`
        UPDATE secrets
        SET current_version_id = NULL
        WHERE id = ${written.secretId}
      `;
    });

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });

  it("keeps non-protected development grants on the First Value carve-out without a passed production gate", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("RID04_FIRST_VALUE");
    await writeTestSecret(variableKey, new TextEncoder().encode("first-value"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
      evaluateStorageSecurityGate: createBlockedProductionGateEvaluator(),
    });

    expect(issued.grantId).toBeDefined();
  });
});
