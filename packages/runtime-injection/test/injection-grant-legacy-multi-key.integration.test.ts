import { AUTH_ERROR_CODES, injectionGrantId } from "@insecur/domain";
import { expect, it } from "vitest";
import { withTenantScope } from "@insecur/tenant-store";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { consumeInjectionGrant } from "../src/injection-grants.js";
import { describeInjectionGrantIntegration } from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

describeInjectionGrantIntegration("Runtime Injection Grant legacy multi-key safety", () => {
  it("denies consume without burning a legacy multi-key grant row", async () => {
    const org = testOrganization();
    const firstKey = uniqueVariableKey("FV11_MULTI_A");
    const secondKey = uniqueVariableKey("FV11_MULTI_B");
    const first = await writeTestSecret(firstKey, new TextEncoder().encode("multi-a"));
    const second = await writeTestSecret(secondKey, new TextEncoder().encode("multi-b"));

    const grantId = injectionGrantId.generate();
    const expiresAt = new Date(Date.now() + 60_000);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO injection_grants (
          id,
          org_id,
          project_id,
          environment_id,
          variable_keys,
          secret_ids,
          secret_version_id,
          expires_at
        )
        VALUES (
          ${grantId},
          ${org},
          ${testProject()},
          ${testEnvironment()},
          ${[firstKey, secondKey]},
          ${[first.secretId, second.secretId]},
          ${first.secretVersionId},
          ${expiresAt.toISOString()}
        )
      `;
    });

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId,
        variableKey: firstKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    const afterFirstAttempt = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        const rows = await sql<{ consumed_at: Date | null }[]>`
          SELECT consumed_at
          FROM injection_grants
          WHERE id = ${grantId}
          LIMIT 1
        `;
        return rows[0];
      },
    );
    expect(afterFirstAttempt?.consumed_at).toBeNull();

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId,
        variableKey: secondKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
