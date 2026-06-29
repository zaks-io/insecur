import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  brandValue,
  INJECTION_ERROR_CODES,
  injectionGrantId,
} from "@insecur/domain";
import { expect, it } from "vitest";
import { withTenantScope } from "@insecur/tenant-store";
import { TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { InjectionGrantError } from "../src/injection-grant-error.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
import { describeInjectionGrantIntegration } from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

describeInjectionGrantIntegration("Runtime Injection Grant consume denials", () => {
  it("denies consume with org-only audit when grant id is malformed", async () => {
    const org = testOrganization();
    const malformedGrantId = brandValue<string, "InjectionGrantId">("igr_not-a-valid-grant-id");
    const variableKey = uniqueVariableKey("FV11_MALFORMED_GRANT");
    const plaintext = new TextEncoder().encode(`malformed-grant-${crypto.randomUUID()}`);
    await writeTestSecret(variableKey, plaintext);

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: malformedGrantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    const deniedRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return sql<
          {
            event_code: string;
            outcome: string;
            result_code: string | null;
            project_id: string | null;
            environment_id: string | null;
            resource_type: string | null;
            resource_id: string | null;
          }[]
        >`
          SELECT
            event_code,
            outcome,
            result_code,
            project_id,
            environment_id,
            resource_type,
            resource_id
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied}
            AND actor_user_id = ${TEST_USER_ID}
            AND project_id IS NULL
            AND environment_id IS NULL
            AND resource_id IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );

    expect(deniedRows).toHaveLength(1);
    expect(deniedRows[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
      outcome: "denied",
      result_code: AUTH_ERROR_CODES.insufficientScope,
      project_id: null,
      environment_id: null,
      resource_type: null,
      resource_id: null,
    });
    expect(JSON.stringify(deniedRows)).not.toContain(malformedGrantId);
    expect(JSON.stringify(deniedRows)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("denies consume with org-only audit when grant id does not exist", async () => {
    const org = testOrganization();
    const missingGrantId = injectionGrantId.generate();
    const variableKey = uniqueVariableKey("FV11_MISSING_GRANT");
    const plaintext = new TextEncoder().encode(`missing-grant-${crypto.randomUUID()}`);
    await writeTestSecret(variableKey, plaintext);

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: missingGrantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    const deniedRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return sql<
          {
            event_code: string;
            outcome: string;
            result_code: string | null;
            project_id: string | null;
            environment_id: string | null;
            resource_type: string | null;
            resource_id: string | null;
          }[]
        >`
          SELECT
            event_code,
            outcome,
            result_code,
            project_id,
            environment_id,
            resource_type,
            resource_id
          FROM audit_events
          WHERE resource_id = ${brandOpaqueResourceIdForPrefix("igr", missingGrantId)}
            AND event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied}
        `;
      },
    );

    expect(deniedRows).toHaveLength(1);
    expect(deniedRows[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
      outcome: "denied",
      result_code: AUTH_ERROR_CODES.insufficientScope,
      project_id: null,
      environment_id: null,
      resource_type: "injection_grant",
      resource_id: brandOpaqueResourceIdForPrefix("igr", missingGrantId),
    });
    expect(JSON.stringify(deniedRows)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("rejects consume for a binding outside the grant secret set", async () => {
    const org = testOrganization();
    const allowedKey = uniqueVariableKey("FV11_ALLOWED");
    const otherKey = uniqueVariableKey("FV11_OTHER");
    const allowed = await writeTestSecret(allowedKey, new TextEncoder().encode("allowed"));
    const other = await writeTestSecret(otherKey, new TextEncoder().encode("other"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "secret_id", secretId: allowed.secretId },
      actor: testActor(),
    });

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        secretId: other.secretId,
        actor: testActor(),
      }),
    ).rejects.toBeInstanceOf(InjectionGrantError);
  });

  it("rejects consume when variable key selector does not match grant binding", async () => {
    const org = testOrganization();
    const allowedKey = uniqueVariableKey("FV11_VK_ALLOWED");
    const otherKey = uniqueVariableKey("FV11_VK_OTHER");
    await writeTestSecret(allowedKey, new TextEncoder().encode("allowed-vk"));
    await writeTestSecret(otherKey, new TextEncoder().encode("other-vk"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey: allowedKey },
      actor: testActor(),
    });

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        variableKey: otherKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });
});
