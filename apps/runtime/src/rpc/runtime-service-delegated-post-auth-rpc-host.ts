import type { RuntimeEnv } from "../env.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export const RUNTIME_POST_AUTH_RPC = Symbol("runtime-post-auth-rpc");

/** The `this` binding the delegated post-auth RPC method objects run against. */
export interface RuntimePostAuthRpcHost {
  [RUNTIME_POST_AUTH_RPC](): PostAuthRpcRunner;
  readonly env: RuntimeEnv;
}
