import type { RequestId, UserId } from "@insecur/domain";
import type { AuthWorkerEnv } from "../auth/auth-worker-env.js";
import { AbuseLimitError } from "./abuse-limit-error.js";
import { enforcePublicEdgeRateLimit } from "./public-edge-rate-limit.js";
import type { PublicEdgeAbuseTarget } from "./public-edge-abuse-target.js";
import type { PublicEdgeRateLimitBindings } from "./public-edge-rate-limit-bindings.js";
import { recordAbuseDeniedAudit, type AbuseDeniedRuntimeRpc } from "./record-abuse-denied-audit.js";

export type PublicEdgeAbuseEnv = AuthWorkerEnv &
  PublicEdgeRateLimitBindings & {
    readonly RUNTIME: AbuseDeniedRuntimeRpc;
  };

function requestHeaderValue(
  header: (name: string) => string | undefined,
  name: string,
): string | undefined {
  const value = header(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Applies Cloudflare Rate Limiting bindings for a pre-tenant public edge, records a denied
 * audit event on throttle, and rethrows {@link AbuseLimitError} for the route error mapper.
 */
export async function enforcePublicEdgeAbuseControl(
  env: PublicEdgeAbuseEnv,
  header: (name: string) => string | undefined,
  input: {
    target: PublicEdgeAbuseTarget;
    requestId: RequestId;
    actorUserId?: UserId;
  },
): Promise<void> {
  const ipAddress = requestHeaderValue(header, "cf-connecting-ip");
  try {
    await enforcePublicEdgeRateLimit({
      bindings: env,
      target: input.target,
      ...(ipAddress === undefined ? {} : { ipAddress }),
      ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
    });
  } catch (error) {
    if (error instanceof AbuseLimitError) {
      await recordAbuseDeniedAudit(env, {
        target: input.target,
        requestId: input.requestId,
        ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
      });
    }
    throw error;
  }
}
