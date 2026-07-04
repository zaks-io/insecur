import { mintEphemeralSessionCredential } from "@insecur/auth";
import { userId } from "@insecur/domain";

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
  });
  return minted.credential;
}
