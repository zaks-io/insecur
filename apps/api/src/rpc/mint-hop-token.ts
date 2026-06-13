import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  type UserActor,
} from "@insecur/auth";

import type { ApiEnv } from "../env.js";

/**
 * Mint the scoped, audience-bound hop token the API forwards to the Runtime Worker (ADR-0077). The
 * token authenticates the already-verified actor across the private Service Binding and nothing
 * else; it is `insecur-runtime`-audience and short-TTL, so it cannot be replayed against any public
 * route. The Runtime never sees WorkOS - this token is the entire trust it extends to the API.
 */
export async function mintRuntimeHopToken(env: ApiEnv, actor: UserActor): Promise<string> {
  const minted = await mintScopedAccessToken({
    actor,
    audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
    signingSecret: env.RUNTIME_TOKEN_SIGNING_SECRET,
  });
  return minted.token;
}
