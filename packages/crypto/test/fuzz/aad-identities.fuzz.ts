import {
  appConnectionId,
  environmentId,
  organizationId,
  projectId,
  providerCredentialId,
  secretId,
} from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { FIELD_SEPARATOR } from "../../src/envelope-aad.js";
import { serializeSecretCiphertextAad } from "../../src/envelope.js";
import { InvalidAadFieldError } from "../../src/errors.js";
import { serializeProviderCredentialCiphertextAad } from "../../src/provider-credential-envelope.js";
import type {
  ProviderCredentialCiphertextIdentity,
  SecretCiphertextIdentity,
} from "../../src/types.js";

const BASE36_UPPER = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_PROVIDER_CHARS = "abcdefghijklmnopqrstuvwxyz";
const PROVIDER_TAIL_CHARS = `${LOWER_PROVIDER_CHARS}0123456789_-`;

function charArb(chars: string): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: chars.length - 1 }).map((index) => chars[index] ?? "");
}

function resourceIdArb(prefix: string): fc.Arbitrary<string> {
  return fc
    .array(charArb(BASE36_UPPER), { minLength: 26, maxLength: 26 })
    .map((chars) => `${prefix}_${chars.join("")}`);
}

const orgIdArb = resourceIdArb("org").map((raw) => organizationId.brand(raw));
const projectIdArb = resourceIdArb("prj").map((raw) => projectId.brand(raw));
const environmentIdArb = resourceIdArb("env").map((raw) => environmentId.brand(raw));
const secretIdArb = resourceIdArb("sec").map((raw) => secretId.brand(raw));
const appConnectionIdArb = resourceIdArb("conn").map((raw) => appConnectionId.brand(raw));
const providerCredentialIdArb = resourceIdArb("pcred").map((raw) =>
  providerCredentialId.brand(raw),
);
const providerArb = fc
  .tuple(
    charArb(LOWER_PROVIDER_CHARS),
    fc.array(charArb(PROVIDER_TAIL_CHARS), { minLength: 1, maxLength: 31 }),
  )
  .map(([head, tail]) => `${head}${tail.join("")}`)
  .filter((provider) => provider !== "webhook-signing-secret");
const secretIdentityArb: fc.Arbitrary<SecretCiphertextIdentity> = fc.record({
  organizationId: orgIdArb,
  projectId: projectIdArb,
  environmentId: environmentIdArb,
  secretId: secretIdArb,
});
const providerCredentialIdentityArb: fc.Arbitrary<ProviderCredentialCiphertextIdentity> = fc.record(
  {
    organizationId: orgIdArb,
    appConnectionId: appConnectionIdArb,
    provider: providerArb,
    credentialId: providerCredentialIdArb,
  },
);

function aadText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("ciphertext AAD identity fuzz", () => {
  it("keeps valid secret identities injective across the serialized AAD tuple", () => {
    fc.assert(
      fc.property(secretIdentityArb, secretIdArb, (identity, replacementSecretId) => {
        const aad = serializeSecretCiphertextAad(identity);
        const changed = serializeSecretCiphertextAad({
          ...identity,
          secretId: replacementSecretId,
        });

        expect(aadText(aad).split(FIELD_SEPARATOR)).toHaveLength(5);
        if (replacementSecretId !== identity.secretId) {
          expect(changed).not.toEqual(aad);
        }
      }),
    );
  });

  it("rejects separator/control-character injection before AAD serialization", () => {
    fc.assert(
      fc.property(
        secretIdentityArb,
        fc.constantFrom(FIELD_SEPARATOR, "\n", "\u007f"),
        (identity, control) => {
          expect(() =>
            serializeSecretCiphertextAad({
              ...identity,
              secretId: `${identity.secretId}${control}` as typeof identity.secretId,
            }),
          ).toThrow(InvalidAadFieldError);
        },
      ),
    );
  });

  it("keeps provider credentials injective across the serialized AAD tuple", () => {
    fc.assert(
      fc.property(
        providerCredentialIdentityArb,
        providerCredentialIdArb,
        (identity, replacementCredentialId) => {
          const aad = serializeProviderCredentialCiphertextAad(identity);
          const changed = serializeProviderCredentialCiphertextAad({
            ...identity,
            credentialId: replacementCredentialId,
          });

          expect(aadText(aad).split(FIELD_SEPARATOR)).toHaveLength(5);
          if (replacementCredentialId !== identity.credentialId) {
            expect(changed).not.toEqual(aad);
          }
        },
      ),
    );
  });

  it("rejects separator/control-character injection in provider credential AAD", () => {
    fc.assert(
      fc.property(
        providerCredentialIdentityArb,
        fc.constantFrom(FIELD_SEPARATOR, "\n", "\u007f"),
        (identity, control) => {
          expect(() =>
            serializeProviderCredentialCiphertextAad({
              ...identity,
              provider: `${identity.provider}${control}` as typeof identity.provider,
            }),
          ).toThrow(InvalidAadFieldError);
        },
      ),
    );
  });
});
