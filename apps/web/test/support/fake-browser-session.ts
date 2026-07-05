import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";

export const FAKE_WORKOS_USER_ID = "user_01workos";
export const FAKE_ADMITTED_USER_ID = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
export const FAKE_SEALED_SESSION = "sealed-session-fake";
export const FAKE_SESSION_ID = "session_web_fake";

/**
 * Default fake WorkOS session entry for `createFakeWorkOSSessionPort`: an MFA-backed sealed
 * session for the fake admitted user. Tests own their `vi.mock("./workos-port.js", ...)` line
 * (fakes must be wired through test factories, never env; see worker-kit's
 * `FakeWorkOSSessionConfigError`) and feed it entries built here.
 */
export function fakeSessionEntry(
  overrides: Partial<FakeWorkOSSessionEntry> = {},
): FakeWorkOSSessionEntry {
  return {
    sessionData: FAKE_SEALED_SESSION,
    userId: FAKE_WORKOS_USER_ID,
    sessionId: FAKE_SESSION_ID,
    authFactors: [{ type: "totp" }],
    ...overrides,
  };
}

/**
 * Mint the short-TTL HS256 bearer the preview-smoke path accepts when
 * `PREVIEW_SMOKE_SESSION_CREDENTIALS` is enabled, signed with the deterministic test secret.
 */
export async function mintFakeSmokeBearer(ttlSeconds?: number): Promise<string> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: FAKE_ADMITTED_USER_ID,
      workosUserId: FAKE_WORKOS_USER_ID,
      sessionId: "session_web_smoke",
    },
    signingSecret: testSessionSigningSecret(),
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
  });
  return minted.credential;
}
