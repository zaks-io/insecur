import type { AdmittedUserResolver, InsecurAuthConfig } from "@insecur/auth";
import { userId, type UserId } from "@insecur/domain";
import type { WorkerEnv } from "../env.js";

function parseAdmittedUserMap(raw: string | undefined): Map<string, UserId> {
  if (raw === undefined || raw.trim() === "") {
    return new Map();
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return new Map();
  }
  const entries: [string, UserId][] = [];
  for (const [workosUserId, insecurUserId] of Object.entries(parsed)) {
    if (typeof insecurUserId !== "string") {
      continue;
    }
    const branded = userId.parse(insecurUserId);
    if (branded.ok) {
      entries.push([workosUserId, branded.value]);
    }
  }
  return new Map(entries);
}

export function createAuthConfig(env: WorkerEnv): InsecurAuthConfig {
  return {
    workos: {
      apiKey: env.WORKOS_API_KEY,
      clientId: env.WORKOS_CLIENT_ID,
      cookiePassword: env.WORKOS_COOKIE_PASSWORD,
    },
    sessionSigningSecret: env.SESSION_SIGNING_SECRET,
  };
}

export function createAdmittedUserResolver(env: WorkerEnv): AdmittedUserResolver {
  const admitted = parseAdmittedUserMap(env.ADMITTED_USER_MAP_JSON);
  return (workosUserId: string) => Promise.resolve(admitted.get(workosUserId) ?? null);
}
