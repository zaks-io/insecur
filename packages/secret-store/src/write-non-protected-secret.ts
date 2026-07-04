import type { Keyring } from "@insecur/crypto";
import type { SecretId, SecretVersionId, VariableKey } from "@insecur/domain";
import { assertEnvironmentAllowsNonProtectedWrite } from "./assert-environment-allows-non-protected-write.js";
import {
  runBlindSecretWrite,
  toStoredWrappedSecretMaterial,
  type BlindSecretWriteInput,
} from "./blind-secret-write.js";

export type WriteNonProtectedSecretInput = BlindSecretWriteInput & { keyring: Keyring };

export interface WriteNonProtectedSecretResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  createdSecretShape: boolean;
  auditEventId?: string;
}

export { toStoredWrappedSecretMaterial };

/**
 * Non-protected Blind Secret Write create-or-update through the Secret Version Store.
 */
export async function writeNonProtectedSecret(
  input: WriteNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  const result = await runBlindSecretWrite(
    input,
    "non_protected_live",
    assertEnvironmentAllowsNonProtectedWrite,
  );
  return {
    secretId: result.secretId,
    secretVersionId: result.secretVersionId,
    variableKey: result.variableKey,
    createdSecretShape: result.createdSecretShape,
    ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
  };
}
