import { resolveHighAssuranceClearAssuranceFromWorkOSStepUp, type UserActor } from "@insecur/auth";
import { requestId } from "@insecur/domain";
import { AuthFailureError, readRequiredString } from "@insecur/worker-kit";
import type { ApiEnv } from "../../env.js";
import { createAuthContext } from "./user-route-validation.js";

export async function resolveWorkOSSessionAssuranceFromStepUp(
  env: ApiEnv,
  userActor: UserActor,
  body: Record<string, unknown>,
  requestHeaders: {
    readonly ipAddress?: string;
    readonly userAgent?: string;
  },
) {
  const stepUpCode = readRequiredString(body, "stepUpCode");
  const stepUpCodeVerifier = readRequiredString(body, "stepUpCodeVerifier");
  const { workos } = createAuthContext(env);
  const resolved = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
    workos,
    actor: userActor,
    stepUpCode,
    stepUpCodeVerifier,
    ...(requestHeaders.ipAddress === undefined ? {} : { ipAddress: requestHeaders.ipAddress }),
    ...(requestHeaders.userAgent === undefined ? {} : { userAgent: requestHeaders.userAgent }),
  });
  if (!resolved.ok) {
    throw new AuthFailureError(resolved.failure, requestId.generate());
  }
  return resolved.sessionAssurance;
}
