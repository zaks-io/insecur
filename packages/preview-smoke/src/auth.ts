import { mintEphemeralSessionCredential } from "@insecur/auth";
import { userId } from "@insecur/domain";

import { registerSmokeArtifactCredential } from "./artifact-credential-registry";

export const PREVIEW_SMOKE_SESSION_TTL_SECONDS = 25 * 60;

export function authHeaders(bearer: string): Record<string, string> {
  return { Authorization: `Bearer ${bearer}` };
}

export async function mintBearer(input: {
  rawUserId: string;
  sessionId: string;
  signingSecret: string;
  workosUserId: string;
}): Promise<string> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      sessionId: input.sessionId,
      type: "user",
      userId: userId.brand(input.rawUserId),
      workosUserId: input.workosUserId,
    },
    signingSecret: input.signingSecret,
    // The API verifies this HMAC credential without a session lookup, then checks its session id
    // against the revocation store. The short TTL bounds an interrupted cleanup window.
    ttlSeconds: PREVIEW_SMOKE_SESSION_TTL_SECONDS,
  });
  registerSmokeArtifactCredential(minted.credential);
  return minted.credential;
}
