import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  RUNTIME_POLICY_ERROR_CODES,
  environmentId,
  INJECTION_ERROR_CODES,
  projectId,
  secretId,
  type VariableKey,
} from "@insecur/domain";
import { PRODUCTION_DELIVERY_PATHS } from "@insecur/storage-security-gate";
import { expect, it } from "vitest";
import { TEST_ENV_B_ID, TEST_PROJECT_B_ID } from "../../tenant-store/test/rls/test-ids.js";
import { uniqueVariableKey, writeTestSecret } from "../../secret-store/test/integration-helpers.js";
import { testDisplayName } from "../../secret-store/test/test-display-name.js";
import { issueInjectionGrant } from "../src/injection-grants.js";
import {
  deleteProtectedPreviewEnvironment,
  describeInjectionGrantIntegration,
  loadLatestIssueDeniedAudit,
  recreateProtectedPreviewEnvironment,
} from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";
import { createPassedProductionGateEvaluator } from "./gate-test-helpers.js";

describeInjectionGrantIntegration("Runtime Injection Grant issue denials", () => {
  it("denies protected-environment issue for human sessions on the production delivery path", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_PROTECTED");
    const protectedEnvironmentId = await recreateProtectedPreviewEnvironment({
      organizationId: org,
      projectId: testProject(),
      displayName: testDisplayName("Protected Preview"),
    });

    try {
      await expect(
        issueInjectionGrant({
          organizationId: org,
          projectId: testProject(),
          environmentId: protectedEnvironmentId,
          selector: { kind: "variable_key", variableKey },
          actor: testActor(),
          deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
          evaluateStorageSecurityGate: createPassedProductionGateEvaluator(),
        }),
      ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked });

      const deniedAudit = await loadLatestIssueDeniedAudit(org);
      expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
      expect(deniedAudit?.outcome).toBe("denied");
      expect(deniedAudit?.result_code).toBe(RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked);
    } finally {
      await deleteProtectedPreviewEnvironment(org);
    }
  });

  it("denies issue with audit when variable key selector does not exist", async () => {
    const org = testOrganization();
    const missingKey: VariableKey = uniqueVariableKey("FV11_MISSING_VK");

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey: missingKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const deniedAudit = await loadLatestIssueDeniedAudit(org);
    expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
    expect(deniedAudit?.outcome).toBe("denied");
    expect(deniedAudit?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
  });

  it("denies issue with audit when secret id selector does not exist", async () => {
    const org = testOrganization();
    const missingSecretId = secretId.generate();

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "secret_id", secretId: missingSecretId },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const deniedAudit = await loadLatestIssueDeniedAudit(org);
    expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
    expect(deniedAudit?.outcome).toBe("denied");
    expect(deniedAudit?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
  });

  it("denies issue when project and environment coordinates disagree", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_COORD");
    await writeTestSecret(variableKey, new TextEncoder().encode("coord-test"));

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: environmentId.brand(TEST_ENV_B_ID),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: projectId.brand(TEST_PROJECT_B_ID),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });
});
