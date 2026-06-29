import { createWorkOSSessionPort, type WorkOSSessionPort } from "@insecur/auth";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { createAuthConfig } from "./config.js";

export class FakeWorkOSSessionConfigError extends Error {
  constructor() {
    super(
      "auth configuration invalid: WORKOS_FAKE_SESSIONS_JSON is test-only and cannot be used by deployable auth composition",
    );
    this.name = "FakeWorkOSSessionConfigError";
  }
}

function hasConfiguredFakeSessions(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  return !Array.isArray(parsed) || parsed.length > 0;
}

/**
 * Deployable Worker auth composition always uses the real WorkOS adapter.
 * Fake sessions must be wired explicitly through test/local factories.
 */
export function createWorkOSSessionPortFromEnv(env: AuthWorkerEnv): WorkOSSessionPort {
  if (hasConfiguredFakeSessions(env.WORKOS_FAKE_SESSIONS_JSON)) {
    throw new FakeWorkOSSessionConfigError();
  }
  return createWorkOSSessionPort(createAuthConfig(env).workos);
}
