import type { RuntimeRpcResult } from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "./runtime-rpc-entry.js";

/** The `RuntimeService#post` pipeline shape RPC delegate modules are handed. */
export type PostAuthRpcRunner = <T>(
  actorToken: string,
  run: (actors: RuntimeRpcActorContext) => Promise<T>,
) => Promise<RuntimeRpcResult<T>>;
