import type { AdmittedUserResolver } from "@insecur/auth";
import { userId, type UserId } from "@insecur/domain";
import type { AuthContext } from "../auth-context.js";
import type { AuthWorkerEnv } from "../auth-worker-env.js";
import { createAuthConfig } from "../config.js";
import { createWorkOSSessionPortFromEnv } from "../workos-port.js";

/**
 * Test-only admitted-user resolver backed by an in-memory WorkOS-subject map.
 * Production paths must use the persisted Tenant-Scoped Store resolver instead.
 */
export function createFakeAdmittedUserResolver(
  admissions: Readonly<Record<string, UserId>>,
): AdmittedUserResolver {
  const admitted = new Map(Object.entries(admissions));
  return (workosUserId: string) => Promise.resolve(admitted.get(workosUserId) ?? null);
}

export function createTestAuthContext(
  env: AuthWorkerEnv,
  admissions: Readonly<Record<string, UserId>>,
  options?: { resolveAdmittedUser?: AdmittedUserResolver },
): AuthContext {
  const config = createAuthConfig(env);
  return {
    config,
    workos: createWorkOSSessionPortFromEnv(env),
    resolveAdmittedUser: options?.resolveAdmittedUser ?? createFakeAdmittedUserResolver(admissions),
  };
}

/** Parses a JSON admissions map for unit tests only. */
export function parseFakeAdmissionsJson(raw: string | undefined): Record<string, UserId> {
  if (raw === undefined || raw.trim() === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const admissions: Record<string, UserId> = {};
  for (const [workosUserId, insecurUserId] of Object.entries(parsed)) {
    if (typeof insecurUserId !== "string") {
      continue;
    }
    const branded = userId.parse(insecurUserId);
    if (branded.ok) {
      admissions[workosUserId] = branded.value;
    }
  }
  return admissions;
}
