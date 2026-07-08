import type { RuntimeEnv } from "../env.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

/** The `this` binding the delegated post-auth RPC method objects run against. */
export interface RuntimePostAuthRpcHost {
  postAuthRpc(): PostAuthRpcRunner;
  readonly env: RuntimeEnv;
}
