import type { WorkOSAuthFactorSummary } from "./mfa-posture.js";
import type { WorkOSAuthConfig } from "./workos-config.js";
import type {
  WorkOSDeviceAuthorizationResult,
  WorkOSDeviceTokenResult,
  WorkOSSessionContext,
} from "./workos-session-port.js";

const WORKOS_API_BASE = "https://api.workos.com";
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** Collaborators from the WorkOS session adapter the device HTTP calls reuse. */
export interface WorkOSDeviceDeps {
  readonly sessionIdFromAccessToken: (accessToken: string) => string | null;
  readonly listAuthFactors: (userId: string) => Promise<readonly WorkOSAuthFactorSummary[]>;
  readonly buildContext: (
    user: { id: string; email?: string },
    sessionId: string,
    authenticationMethod: string | undefined,
    authFactors: readonly WorkOSAuthFactorSummary[],
  ) => WorkOSSessionContext;
}

function readNumberField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Headers the WorkOS SDK sends on every User Management request. The SDK's base HTTP client sets
 * `Authorization: Bearer <apiKey>` on all calls; our raw device fetches must match it or WorkOS
 * rejects the request with `invalid_client` (the PKCE path gets this for free via the SDK).
 */
function workosRequestHeaders(config: WorkOSAuthConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
}

export async function startDeviceAuthorizationWithWorkOS(
  config: WorkOSAuthConfig,
): Promise<WorkOSDeviceAuthorizationResult> {
  const response = await fetch(`${WORKOS_API_BASE}/user_management/authorize/device`, {
    method: "POST",
    headers: workosRequestHeaders(config),
    body: JSON.stringify({ client_id: config.clientId }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || body === null) {
    throw new Error(
      `WorkOS device authorization request failed (status ${String(response.status)}).`,
    );
  }
  const deviceCode = readStringField(body, "device_code");
  const userCode = readStringField(body, "user_code");
  const verificationUri = readStringField(body, "verification_uri");
  if (deviceCode === undefined || userCode === undefined || verificationUri === undefined) {
    throw new Error("WorkOS device authorization response is missing required fields.");
  }
  const verificationUriComplete = readStringField(body, "verification_uri_complete");
  return {
    deviceCode,
    userCode,
    verificationUri,
    ...(verificationUriComplete === undefined ? {} : { verificationUriComplete }),
    expiresInSeconds: readNumberField(body, "expires_in", 300),
    intervalSeconds: readNumberField(body, "interval", 5),
  };
}

function mapDeviceTokenError(error: string | undefined): WorkOSDeviceTokenResult {
  switch (error) {
    case "authorization_pending":
      return { status: "authorization_pending" };
    case "slow_down":
      return { status: "slow_down" };
    case "access_denied":
      return { status: "denied" };
    case "expired_token":
      return { status: "expired" };
    default:
      return { status: "invalid", reason: "invalid" };
  }
}

function deviceTokenUser(body: Record<string, unknown>): { id: string; email?: string } | null {
  const user = body.user as { id?: unknown; email?: unknown } | undefined;
  if (typeof user?.id !== "string") {
    return null;
  }
  return { id: user.id, ...(typeof user.email === "string" ? { email: user.email } : {}) };
}

export async function authenticateDeviceCodeWithWorkOS(
  config: WorkOSAuthConfig,
  deps: WorkOSDeviceDeps,
  deviceCode: string,
): Promise<WorkOSDeviceTokenResult> {
  const response = await fetch(`${WORKOS_API_BASE}/user_management/authenticate`, {
    method: "POST",
    headers: workosRequestHeaders(config),
    body: JSON.stringify({
      client_id: config.clientId,
      grant_type: DEVICE_CODE_GRANT_TYPE,
      device_code: deviceCode,
    }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || body === null) {
    return mapDeviceTokenError(body === null ? undefined : readStringField(body, "error"));
  }
  // The WorkOS device-code grant returns access_token/refresh_token/user, NOT a sealed session
  // (unlike authenticateWithCode). The broker mints its own ephemeral CLI credential from the
  // access-token claims, so sealed_session is deliberately not required here.
  const accessToken = readStringField(body, "access_token");
  const user = deviceTokenUser(body);
  if (accessToken === undefined || user === null) {
    return { status: "invalid", reason: "invalid" };
  }
  const sessionId = deps.sessionIdFromAccessToken(accessToken);
  if (sessionId === null) {
    return { status: "invalid", reason: "invalid" };
  }
  const authFactors = await deps.listAuthFactors(user.id);
  return {
    status: "authenticated",
    context: deps.buildContext(
      user,
      sessionId,
      readStringField(body, "authentication_method"),
      authFactors,
    ),
  };
}
