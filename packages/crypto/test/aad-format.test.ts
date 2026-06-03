import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { ENVELOPE_FORMAT_VERSION, RECORD_TYPE_SECRET } from "../src/constants.js";
import {
  identityMatches,
  serializeSecretCiphertextAad,
  serializeSecretDekWrapAad,
} from "../src/envelope.js";
import type { SecretCiphertextIdentity } from "../src/types.js";

const FIELD_SEPARATOR = "\u001f";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const PROJECT_B = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const ENV_B = environmentId.brand("env_01JZ8E7A8G2Q6M0S5U7V9W1X3Z");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");
const SECRET_B = secretId.brand("sec_01JZ8E9C0I4S8O2U7W9X1Y3Z5B");

function identity(overrides: Partial<SecretCiphertextIdentity> = {}): SecretCiphertextIdentity {
  return {
    organizationId: ORG_A,
    projectId: PROJECT_A,
    environmentId: ENV_A,
    secretId: SECRET_A,
    ...overrides,
  };
}

function expectedSecretCiphertextAadBytes(id: SecretCiphertextIdentity): Uint8Array {
  const text = [
    String(RECORD_TYPE_SECRET),
    id.organizationId,
    id.projectId,
    id.environmentId,
    id.secretId,
  ].join(FIELD_SEPARATOR);
  return new TextEncoder().encode(text);
}

function expectedDekWrapAadBytes(projectDataKeyVersion: number): Uint8Array {
  const text = [
    String(RECORD_TYPE_SECRET),
    String(ENVELOPE_FORMAT_VERSION),
    String(projectDataKeyVersion),
  ].join(FIELD_SEPARATOR);
  return new TextEncoder().encode(text);
}

describe("serializeSecretCiphertextAad", () => {
  it("produces canonical record-type, separator, and identity field order", () => {
    const id = identity();
    const aad = serializeSecretCiphertextAad(id);
    const expected = expectedSecretCiphertextAadBytes(id);

    expect(aad).toEqual(expected);
    expect(aad[0]).toBe(RECORD_TYPE_SECRET + 0x30);
    expect(aad[1]).toBe(0x1f);
    expect(aad.indexOf(0x1f)).toBeGreaterThan(0);
  });
});

describe("serializeSecretDekWrapAad", () => {
  it("produces canonical record type, format version, and key version bytes", () => {
    const projectDataKeyVersion = 3;
    const aad = serializeSecretDekWrapAad(projectDataKeyVersion);
    const expected = expectedDekWrapAadBytes(projectDataKeyVersion);

    expect(aad).toEqual(expected);
    expect(aad[0]).toBe(RECORD_TYPE_SECRET + 0x30);
    expect(aad[1]).toBe(0x1f);
    expect(aad[2]).toBe(ENVELOPE_FORMAT_VERSION + 0x30);
    expect(aad[3]).toBe(0x1f);
    expect(aad[4]).toBe(projectDataKeyVersion + 0x30);
  });
});

describe("identityMatches", () => {
  const base = identity();

  it("returns true when all four identity fields match", () => {
    expect(identityMatches(base, identity())).toBe(true);
  });

  it("returns false when organizationId differs", () => {
    expect(identityMatches(base, identity({ organizationId: ORG_B }))).toBe(false);
  });

  it("returns false when projectId differs", () => {
    expect(identityMatches(base, identity({ projectId: PROJECT_B }))).toBe(false);
  });

  it("returns false when environmentId differs", () => {
    expect(identityMatches(base, identity({ environmentId: ENV_B }))).toBe(false);
  });

  it("returns false when secretId differs", () => {
    expect(identityMatches(base, identity({ secretId: SECRET_B }))).toBe(false);
  });
});
