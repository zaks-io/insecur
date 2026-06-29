import type { UserActor } from "@insecur/auth";
import {
  unwrapRuntimeResult,
  type ConsumeGrantRpcInput,
  type RuntimeDeliveryEnvelope,
  type RuntimeSecretWritePayload,
  type WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { ApiEnv } from "../env.js";
import { mintRuntimeHopToken } from "./mint-hop-token.js";

type WithoutActorToken<T> = T extends { readonly actorToken: string }
  ? Omit<T, "actorToken">
  : never;

export type RuntimeSecretWriteInput = WithoutActorToken<WriteSecretRpcInput>;
export type RuntimeGrantConsumeInput = Omit<ConsumeGrantRpcInput, "actorToken">;

/**
 * API-side Runtime RPC caller boundary (ADR-0077). Public routes keep HTTP parsing and validation;
 * this module owns the private binding choreography: mint scoped hop token, call Runtime, unwrap the
 * RPC result into the API error seam.
 */
export async function writeRuntimeSecret(
  env: ApiEnv,
  actor: UserActor,
  input: RuntimeSecretWriteInput,
): Promise<RuntimeSecretWritePayload> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.writeSecret({ ...input, actorToken }));
}

export async function consumeRuntimeGrant(
  env: ApiEnv,
  actor: UserActor,
  input: RuntimeGrantConsumeInput,
): Promise<RuntimeDeliveryEnvelope> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.consumeGrant({ ...input, actorToken }));
}
