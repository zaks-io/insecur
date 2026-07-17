import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";
import type {
  CreateSecretSyncRpcInput,
  RunSecretSyncRpcInput,
  SecretSyncMutationRpcPayload,
  SecretSyncRunRpcPayload,
  UpdateSecretSyncRpcInput,
} from "./runtime-secret-sync-rpc-contract.js";

/**
 * Secret Sync configuration RPCs (INS-608). Both are keyring-adjacent mutations that run inside
 * the Runtime deploy; the API Worker only parses and forwards, including the optional
 * `protectedChangeId` reference for protected-environment enables.
 */
export interface RuntimeSecretSyncRpc {
  createSecretSync(
    input: CreateSecretSyncRpcInput,
  ): Promise<RuntimeRpcResult<SecretSyncMutationRpcPayload>>;
  updateSecretSync(
    input: UpdateSecretSyncRpcInput,
  ): Promise<RuntimeRpcResult<SecretSyncMutationRpcPayload>>;
  /**
   * Inline Sync Execution (ADR-0057) inside the Runtime deploy: Operation
   * Store lease, Sync Execution Revalidation, decrypt, and the provider
   * writes all happen behind this call; the payload is metadata-only.
   */
  runSecretSync(input: RunSecretSyncRpcInput): Promise<RuntimeRpcResult<SecretSyncRunRpcPayload>>;
}
