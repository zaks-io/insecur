import type {
  EnvironmentId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

export interface WriteNonProtectedSecretInput {
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  /** Existing secret selector; omit to client-mint on create-or-update. */
  secretId?: SecretId;
  /**
   * UTF-8 secret bytes from a safe input path (stdin, generation service, request body).
   * Never include in metadata-only outputs.
   */
  valueUtf8: Uint8Array;
  allowEmpty?: boolean;
}

/** Metadata-only secret write result. */
export interface WriteNonProtectedSecretResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  createdSecretShape: boolean;
}

/**
 * Non-protected Blind Secret Write create-or-update through the Secret Version Store.
 */
export function writeNonProtectedSecret(
  input: WriteNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  void input;
  return Promise.reject(new NotImplementedError("writeNonProtectedSecret"));
}
