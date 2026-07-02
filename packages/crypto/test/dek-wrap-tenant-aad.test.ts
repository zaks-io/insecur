import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RECORD_TYPE_SECRET } from "../src/constants.js";
import { DecryptError } from "../src/errors.js";
import { createKeyring } from "../src/keyring.js";
import {
  openTenantBoundEnvelope,
  sealTenantBoundEnvelope,
  serializeDekWrapAad,
} from "../src/envelope-engine.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const PROJECT_B = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describe("DEK-wrap tenant coordinate AAD", () => {
  it("round-trips when seal and open use the same tenant coordinate", async () => {
    const keyring = createKeyring(createTestRootKey());
    const versions = await keyring.getActiveDataKeyVersions(ORG_A, PROJECT_A);
    const tenantDataKey = await keyring.getProjectDataKey(ORG_A, PROJECT_A, versions);
    const ciphertextAad = new TextEncoder().encode("value-layer-aad");
    const plaintextUtf8 = new TextEncoder().encode("secret-value");
    const dekWrapTenantCoordinate = {
      organizationId: ORG_A,
      scopeProjectId: PROJECT_A,
    };

    const envelope = await sealTenantBoundEnvelope({
      recordType: RECORD_TYPE_SECRET,
      tenantDataKey,
      tenantDataKeyVersion: versions.projectDataKeyVersion,
      dekWrapTenantCoordinate,
      ciphertextAad,
      plaintextUtf8,
    });

    const opened = await openTenantBoundEnvelope({
      recordType: RECORD_TYPE_SECRET,
      envelopeBytes: envelope,
      tenantDataKey,
      dekWrapTenantCoordinate,
      ciphertextAad,
    });

    expect(new TextDecoder().decode(opened)).toBe("secret-value");
  });

  it("fails to open when the DEK-wrap tenant coordinate does not match seal-time binding", async () => {
    const keyring = createKeyring(createTestRootKey());
    const versions = await keyring.getActiveDataKeyVersions(ORG_A, PROJECT_A);
    const tenantDataKey = await keyring.getProjectDataKey(ORG_A, PROJECT_A, versions);
    const ciphertextAad = new TextEncoder().encode("value-layer-aad");
    const plaintextUtf8 = new TextEncoder().encode("secret-value");

    const envelope = await sealTenantBoundEnvelope({
      recordType: RECORD_TYPE_SECRET,
      tenantDataKey,
      tenantDataKeyVersion: versions.projectDataKeyVersion,
      dekWrapTenantCoordinate: {
        organizationId: ORG_A,
        scopeProjectId: PROJECT_A,
      },
      ciphertextAad,
      plaintextUtf8,
    });

    await expect(
      openTenantBoundEnvelope({
        recordType: RECORD_TYPE_SECRET,
        envelopeBytes: envelope,
        tenantDataKey,
        dekWrapTenantCoordinate: {
          organizationId: ORG_B,
          scopeProjectId: PROJECT_B,
        },
        ciphertextAad,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("includes tenant coordinates in serialized DEK-wrap AAD bytes", () => {
    const aad = serializeDekWrapAad(RECORD_TYPE_SECRET, 1, {
      organizationId: ORG_A,
      scopeProjectId: PROJECT_A,
    });
    const text = new TextDecoder().decode(aad);
    expect(text).toContain(ORG_A);
    expect(text).toContain(PROJECT_A);
  });
});
