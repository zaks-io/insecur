import { mintEphemeralSessionCredential } from "@insecur/auth";
import { userId } from "@insecur/domain";

export function authHeaders(bearer: string): Record<string, string> {
  return { Authorization: `Bearer ${bearer}` };
}

export async function mintBearer(
  rawUserId: string,
  workosUserId: string,
  signingSecret: string,
  sessionId: string,
): Promise<string> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      sessionId,
      type: "user",
      userId: userId.brand(rawUserId),
      workosUserId,
    },
    signingSecret,
  });
  return minted.credential;
}
