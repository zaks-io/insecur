import {
  brandOpaqueResourceIdForPrefix,
  INJECTION_ERROR_CODES,
  membershipId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import { expect, it } from "vitest";
import { withTenantScope } from "@insecur/tenant-store";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
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

describeInjectionGrantIntegration("Runtime Injection Grant issue and consume", () => {
  it("denies a different authorized user from consuming another principal's grant", async () => {
    const org = testOrganization();
    const otherUserId = userId.generate();
    const otherMembershipId = membershipId.generate();
    const variableKey = uniqueVariableKey("FV11_CROSS_PRINCIPAL");
    await writeTestSecret(variableKey, new TextEncoder().encode(`cross-${crypto.randomUUID()}`));

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset)
        SELECT ${otherMembershipId}, ${org}, id, ${otherUserId}, ${"developer"}
        FROM teams
        WHERE org_id = ${org}
        ORDER BY created_at ASC
        LIMIT 1
      `;
    });

    try {
      const issued = await issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      });

      await expect(
        consumeInjectionGrant({
          keyring: createTestKeyring(),
          organizationId: org,
          grantId: issued.grantId,
          variableKey,
          actor: { type: "user", userId: otherUserId },
        }),
      ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

      await expect(
        consumeInjectionGrant({
          keyring: createTestKeyring(),
          organizationId: org,
          grantId: issued.grantId,
          variableKey,
          actor: testActor(),
        }),
      ).resolves.toMatchObject({ variableKey });
    } finally {
      await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
        await sql`DELETE FROM memberships WHERE id = ${otherMembershipId}`;
      });
    }
  });

  it("does not burn a grant when decrypt fails before delivery", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_DECRYPT_RETRY");
    const plaintext = new TextEncoder().encode(`retry-${crypto.randomUUID()}`);
    await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const wrongKey = new Uint8Array(32);
    crypto.getRandomValues(wrongKey);
    const { createKeyring } = await import("@insecur/crypto");
    await expect(
      consumeInjectionGrant({
        keyring: createKeyring(wrongKey),
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toThrow();

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
  });

  it("issues a fresh grant and consumes it once with metadata-only surfaces", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv11-${crypto.randomUUID()}`);
    const variableKey: VariableKey = uniqueVariableKey("FV11_GRANT");
    const written = await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    expect(issued.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(issued.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
    expect(JSON.stringify(issued)).not.toContain(new TextDecoder().decode(plaintext));

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_ids).toEqual([written.secretId]);
    expect(stored?.secret_version_ids[0]).toBe(written.secretVersionId);
    expect(stored?.variable_keys).toEqual([variableKey]);

    const issueAuditEventId = issued.auditEventId;
    if (issueAuditEventId === undefined) {
      throw new Error("expected issue audit event id");
    }
    const issueAudit = await loadAuditRow(org, issueAuditEventId);
    expect(issueAudit?.event_code).toBe("runtime_injection.grant_issued");
    expect(issueAudit?.resource_id).toBe(brandOpaqueResourceIdForPrefix("igr", issued.grantId));
    expect(JSON.stringify(issueAudit)).not.toContain(new TextDecoder().decode(plaintext));

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    expect(consumed.secretId).toBe(written.secretId);
    expect(consumed.secretVersionId).toBe(written.secretVersionId);
    expect(consumed.variableKey).toBe(variableKey);
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
    expect(
      JSON.stringify({
        variableKey: consumed.variableKey,
        secretId: consumed.secretId,
        secretVersionId: consumed.secretVersionId,
      }),
    ).not.toContain(new TextDecoder().decode(plaintext));

    const consumeAuditEventId = consumed.auditEventId;
    if (consumeAuditEventId === undefined) {
      throw new Error("expected consume audit event id");
    }
    const consumeAudit = await loadAuditRow(org, consumeAuditEventId);
    expect(consumeAudit?.event_code).toBe("runtime_injection.grant_consumed");
    expect(consumeAudit?.resource_type).toBe("injection_grant");
    expect(consumeAudit?.resource_id).toBe(brandOpaqueResourceIdForPrefix("igr", issued.grantId));
    expect(consumeAudit?.related_resource_type).toBe("secret_version");
    expect(consumeAudit?.related_resource_id).toBe(
      brandOpaqueResourceIdForPrefix("sv", written.secretVersionId),
    );
    expect(JSON.stringify(consumeAudit)).not.toContain(new TextDecoder().decode(plaintext));

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const replayAuditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return sql<{ event_code: string; result_code: string | null }[]>`
        SELECT event_code, result_code
        FROM audit_events
        WHERE resource_id = ${brandOpaqueResourceIdForPrefix("igr", issued.grantId)}
          AND event_code = ${"runtime_injection.grant_consume_denied"}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      },
    );
    expect(replayAuditRows[0]?.event_code).toBe("runtime_injection.grant_consume_denied");
    expect(replayAuditRows[0]?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
    expect(JSON.stringify(replayAuditRows)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("issues and consumes by exact secret id selector", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv11-secret-id-${crypto.randomUUID()}`);
    const variableKey = uniqueVariableKey("FV11_SECRET_ID");
    const written = await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "secret_id", secretId: written.secretId },
      actor: testActor(),
    });

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_version_ids[0]).toBe(written.secretVersionId);

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      secretId: written.secretId,
      actor: testActor(),
    });

    expect(consumed.secretId).toBe(written.secretId);
    expect(consumed.secretVersionId).toBe(written.secretVersionId);
    expect(consumed.variableKey).toBe(variableKey);
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
    expect(() => JSON.stringify(consumed)).toThrow(/PlaintextHandle must not be serialized/);
  });
});
