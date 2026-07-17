import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";
import type {
  CreateSecretSyncRpcInput,
  SecretSyncMutationRpcPayload,
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
}
