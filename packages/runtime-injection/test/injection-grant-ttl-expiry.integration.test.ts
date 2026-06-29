import { INJECTION_ERROR_CODES } from "@insecur/domain";
import { expect, it } from "vitest";
import { withTenantScope } from "@insecur/tenant-store";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
import { describeInjectionGrantIntegration } from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

describeInjectionGrantIntegration("Runtime Injection Grant TTL expiry", () => {
  it("records grant_expired when consuming after TTL", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_EXPIRED");
    await writeTestSecret(variableKey, new TextEncoder().encode("expires-soon"));

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
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantExpired });
  });
});
