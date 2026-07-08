import type { Keyring, SecretCiphertextIdentity } from "@insecur/crypto";
import { secretVersionId, type SecretVersionId } from "@insecur/domain";
import {
  computeSecretWriteDescriptiveVerdicts,
  type SecretWriteDescriptiveVerdicts,
} from "@insecur/secret-store-contracts";

import type { LocalProjectMetadataStore } from "./contracts/project-metadata-store.js";
import type { LocalSecretVersionStore } from "./contracts/secret-version-store.js";
import type { LocalReplaceCurrentVersionInput } from "./contracts/types.js";
import { encryptLocalSecretValue } from "./crypto/encrypt-local-secret.js";

export interface WriteLocalBlindSecretVersionInput extends Omit<
  LocalReplaceCurrentVersionInput,
  "secretVersionId" | "wrapped" | "descriptiveVerdicts"
> {
  readonly keyring: Keyring;
  readonly ciphertextIdentity: SecretCiphertextIdentity;
  readonly valueUtf8: Uint8Array;
  readonly generationHint?: string | null;
}

export interface WriteLocalBlindSecretVersionResult {
  readonly secretVersionId: SecretVersionId;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

export async function writeLocalBlindSecretVersion(
  stores: {
    readonly secretVersions: LocalSecretVersionStore;
    readonly projectMetadata?: LocalProjectMetadataStore;
  },
  input: WriteLocalBlindSecretVersionInput,
): Promise<WriteLocalBlindSecretVersionResult> {
  const generationHint =
    input.generationHint ??
    (stores.projectMetadata === undefined
      ? null
      : ((await stores.projectMetadata.getSecretShape(input.projectId, input.variableKey))
          ?.generationHint ?? null));

  const descriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({
    valueUtf8: input.valueUtf8,
    generationHint,
  });
  const wrapped = await encryptLocalSecretValue(
    input.keyring,
    input.ciphertextIdentity,
    input.valueUtf8,
  );
  const newSecretVersionId = secretVersionId.generate();
  await stores.secretVersions.replaceCurrentVersion({
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: input.secretId,
    secretVersionId: newSecretVersionId,
    variableKey: input.variableKey,
    wrapped,
    descriptiveVerdicts,
  });

  return {
    secretVersionId: newSecretVersionId,
    descriptiveVerdicts,
  };
}
