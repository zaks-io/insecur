import {
  appConnectionId,
  brandOpaqueResourceIdForPrefix,
  organizationId,
  projectId,
  providerCredentialId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { FIELD_SEPARATOR } from "../src/envelope-aad.js";
import { InvalidAadFieldError } from "../src/errors.js";
import {
  serializeProviderCredentialCiphertextAad,
  serializeSensitiveMetadataCiphertextAad,
} from "../src/encryption.js";
import { SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL } from "../src/constants.js";
import type {
  ProviderCredentialCiphertextIdentity,
  SensitiveMetadataCiphertextIdentity,
} from "../src/types.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const PROJECT = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const RECORD_A = brandOpaqueResourceIdForPrefix("aud", "aud_01JZ8E8B9H3R7N1T6V8W0X2Y4A");
const RECORD_B = brandOpaqueResourceIdForPrefix("aud", "aud_01JZ8E9C0I4S8O2U7W9X1Y3Z5B");

function providerIdentity(
  overrides: Partial<ProviderCredentialCiphertextIdentity> = {},
): ProviderCredentialCiphertextIdentity {
  return {
    organizationId: ORG,
    appConnectionId: CONN,
    provider: "vercel-integration-oauth",
    credentialId: CRED,
    ...overrides,
  };
}

function sensitiveMetadataIdentity(
  overrides: Partial<SensitiveMetadataCiphertextIdentity> = {},
): SensitiveMetadataCiphertextIdentity {
  return {
    organizationId: ORG,
    scopeProjectId: SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
    metadataType: "approval.context_note",
    recordResourceId: RECORD_A,
    fieldKey: "body",
    ...overrides,
  };
}

describe("AAD field-separator injection resistance", () => {
  it("rejects provider connection methods containing the unit separator", () => {
    expect(() =>
      serializeProviderCredentialCiphertextAad(
        providerIdentity({ provider: `vercel${FIELD_SEPARATOR}integration-oauth` }),
      ),
    ).toThrow(InvalidAadFieldError);
  });

  it("rejects sensitive metadata types containing the unit separator", () => {
    expect(() =>
      serializeSensitiveMetadataCiphertextAad(
        sensitiveMetadataIdentity({
          metadataType: `approval${FIELD_SEPARATOR}context_note`,
        }),
      ),
    ).toThrow(InvalidAadFieldError);
  });

  it("rejects sensitive metadata field keys containing the unit separator", () => {
    expect(() =>
      serializeSensitiveMetadataCiphertextAad(
        sensitiveMetadataIdentity({
          fieldKey: `bo${FIELD_SEPARATOR}dy`,
        }),
      ),
    ).toThrow(InvalidAadFieldError);
  });

  it("rejects metadata types that are not stable dotted codes", () => {
    expect(() =>
      serializeSensitiveMetadataCiphertextAad(
        sensitiveMetadataIdentity({ metadataType: "not-a-stable-code" }),
      ),
    ).toThrow(InvalidAadFieldError);
  });

  it("produces distinct provider-credential AAD for distinct valid identities", () => {
    const left = serializeProviderCredentialCiphertextAad(providerIdentity());
    const right = serializeProviderCredentialCiphertextAad(
      providerIdentity({
        credentialId: providerCredentialId.brand("pcred_01JZ8EJN9T4W7Y1A3D6E9G2H5L"),
      }),
    );
    expect(left).not.toEqual(right);
  });

  it("does not allow distinct sensitive-metadata tuples to collide via separator shifting", () => {
    const intended = sensitiveMetadataIdentity();
    const shifted = sensitiveMetadataIdentity({
      metadataType: `approval.context_note${FIELD_SEPARATOR}${RECORD_B}`,
      recordResourceId: RECORD_A,
      fieldKey: "body",
    });

    expect(() => serializeSensitiveMetadataCiphertextAad(shifted)).toThrow(InvalidAadFieldError);

    const alternate = sensitiveMetadataIdentity({
      metadataType: "sync.provider_target_name",
      recordResourceId: RECORD_B,
      fieldKey: "target_name",
      scopeProjectId: PROJECT,
    });
    const intendedAad = serializeSensitiveMetadataCiphertextAad(intended);
    const alternateAad = serializeSensitiveMetadataCiphertextAad(alternate);
    expect(intendedAad).not.toEqual(alternateAad);
  });
});
