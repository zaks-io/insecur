import type { Keyring } from "@insecur/crypto";
import type { SecretId, SecretVersionId, VariableKey } from "@insecur/domain";
import { SECRET_VERSION_LIFECYCLE_STATES } from "@insecur/tenant-store";

import { assertEnvironmentAllowsProtectedDraftWrite } from "./assert-environment-allows-protected-draft-write.js";
import { runBlindSecretWrite, type BlindSecretWriteInput } from "./blind-secret-write.js";

export type WriteProtectedSecretInput = BlindSecretWriteInput & { keyring: Keyring };

export interface WriteProtectedSecretResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  lifecycleState: typeof SECRET_VERSION_LIFECYCLE_STATES.draft;
  createdSecretShape: boolean;
  auditEventId?: string;
}

/**
 * Protected Blind Secret Write create-or-update through the Secret Version Store.
 * Creates Draft Versions only; does not update the live delivery pointer.
 */
export async function writeProtectedSecret(
  input: WriteProtectedSecretInput,
): Promise<WriteProtectedSecretResult> {
  const result = await runBlindSecretWrite(
    input,
    "protected_draft",
    assertEnvironmentAllowsProtectedDraftWrite,
  );
  return {
    secretId: result.secretId,
    secretVersionId: result.secretVersionId,
    variableKey: result.variableKey,
    lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft,
    createdSecretShape: result.createdSecretShape,
    ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
  };
}
