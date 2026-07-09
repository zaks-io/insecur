import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  verifyScopedAccessToken,
  type RuntimeHopActor,
} from "@insecur/auth";

import { validateRuntimeTokenSigningSecret } from "@insecur/worker-kit";

import type { RuntimeEnv } from "../env.js";
import { RuntimeActorTokenError } from "./runtime-rpc-error.js";

/**
 * Verify the forwarded scoped hop token and recover the actor (ADR-0077). The Runtime Worker never
 * sees WorkOS; it trusts only an `insecur-runtime`-audience token the API minted for this hop. An
 * expired token maps to `auth.expired`; any other failure (bad signature, wrong audience, malformed
 * claims) collapses to `auth.invalid` so the seam leaks nothing about why verification failed.
 */
export async function actorFromHopToken(
  env: RuntimeEnv,
  actorToken: string,
): Promise<RuntimeHopActor> {
  validateRuntimeTokenSigningSecret(env.RUNTIME_TOKEN_SIGNING_SECRET);

  const result = await verifyScopedAccessToken({
    token: actorToken,
    expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
    signingSecret: env.RUNTIME_TOKEN_SIGNING_SECRET,
  });
  if (!result.ok) {
    throw new RuntimeActorTokenError(
      result.reason === "expired" ? AUTH_ERROR_CODES.expired : AUTH_ERROR_CODES.invalid,
      result.reason === "expired" ? "scoped hop token expired" : "scoped hop token rejected",
    );
  }
  return result.actor;
}
