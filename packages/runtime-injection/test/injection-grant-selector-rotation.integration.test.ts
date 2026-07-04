import { brandOpaqueResourceIdForPrefix } from "@insecur/domain";
import { expect, it } from "vitest";
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

describeInjectionGrantIntegration("Runtime Injection Grant selector and rotation", () => {
  it("delivers the secret version bound at issue after rotation", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_ROTATE");
    const firstValue = new TextEncoder().encode(`rotate-first-${crypto.randomUUID()}`);
    const secondValue = new TextEncoder().encode(`rotate-second-${crypto.randomUUID()}`);

    const firstWrite = await writeTestSecret(variableKey, firstValue);
    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_version_ids[0]).toBe(firstWrite.secretVersionId);

    const secondWrite = await writeTestSecret(variableKey, secondValue);
    expect(secondWrite.secretVersionId).not.toBe(firstWrite.secretVersionId);

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    expect(consumed.secretVersionId).toBe(firstWrite.secretVersionId);
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(firstValue),
    );
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).not.toBe(
      new TextDecoder().decode(secondValue),
    );

    const consumeAuditEventId = consumed.auditEventId;
    if (consumeAuditEventId === undefined) {
      throw new Error("expected consume audit event id");
    }
    const consumeAudit = await loadAuditRow(org, consumeAuditEventId);
    expect(consumeAudit?.related_resource_type).toBe("secret_version");
    expect(consumeAudit?.related_resource_id).toBe(
      brandOpaqueResourceIdForPrefix("sv", firstWrite.secretVersionId),
    );
    expect(consumeAudit?.related_resource_id).not.toBe(
      brandOpaqueResourceIdForPrefix("sv", secondWrite.secretVersionId),
    );
  });
});
