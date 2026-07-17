import type {
  CreateSecretSyncRpcInput,
  RunSecretSyncRpcInput,
  UpdateSecretSyncRpcInput,
} from "@insecur/worker-kit";

import {
  RUNTIME_POST_AUTH_RPC,
  type RuntimePostAuthRpcHost,
} from "./runtime-service-delegated-post-auth-rpc-host.js";
import {
  createSecretSyncRpc,
  runSecretSyncRpc,
  updateSecretSyncRpc,
} from "./runtime-secret-sync-rpc-delegates.js";

/**
 * Secret Sync post-auth RPC methods (INS-608, INS-78). Split from the main
 * delegated-RPC object so neither file crosses the `max-lines` boundary as
 * backend RPCs are added; spread into `RuntimeServiceDelegatedPostAuthRpc`.
 */
export const RuntimeServiceSecretSyncPostAuthRpc = {
  createSecretSync(this: RuntimePostAuthRpcHost, input: CreateSecretSyncRpcInput) {
    return createSecretSyncRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  updateSecretSync(this: RuntimePostAuthRpcHost, input: UpdateSecretSyncRpcInput) {
    return updateSecretSyncRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  runSecretSync(this: RuntimePostAuthRpcHost, input: RunSecretSyncRpcInput) {
    return runSecretSyncRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
} as const;
