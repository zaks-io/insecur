import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RECORD_TYPE_SECRET } from "../src/constants.js";
import { InvalidAadFieldError } from "../src/errors.js";
import { serializeSecretCiphertextAad } from "../src/envelope.js";
import type { SecretCiphertextIdentity } from "../src/types.js";

const FIELD_SEPARATOR = "\u001f";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");

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

  it("rejects secret identity fields that are not well-formed opaque resource ids", () => {
    expect(() =>
      serializeSecretCiphertextAad(identity({ organizationId: "not-an-id" as typeof ORG_A })),
    ).toThrow(InvalidAadFieldError);
    expect(() =>
      serializeSecretCiphertextAad(identity({ secretId: "bad" as typeof SECRET_A })),
    ).toThrow(InvalidAadFieldError);
  });
});
