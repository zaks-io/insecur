import type { DeriveAgentSessionData, RegisterAgentSessionData } from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import {
  parseEnvelope,
  postAuthorizedJson,
  readCliCredentialHeader,
} from "./http-client-envelope.js";

export async function deriveAgentSession(
  base: string,
  input: {
    readonly bearerCredential: string;
    readonly harnessName?: string;
  },
): Promise<
  | { ok: true; envelope: SuccessEnvelope<DeriveAgentSessionData>; credential: string }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const { response, body } = await postAuthorizedJson(
    base,
    "/v1/session/agent/derive",
    input.bearerCredential,
    input.harnessName === undefined ? {} : { harnessName: input.harnessName },
  );
  const envelope = parseEnvelope<DeriveAgentSessionData>(body);
  if (!response.ok || !envelope.ok) {
    return {
      ok: false,
      envelope: !envelope.ok
        ? envelope
        : { ok: false, error: { code: "api.error", message: "derive failed", retryable: false } },
      httpStatus: response.status,
    };
  }
  const credential = readCliCredentialHeader(
    response,
    "Derived agent session credential missing from response header.",
  );
  return { ok: true, envelope, credential };
}

export async function registerAgentSession(
  base: string,
  input: {
    readonly bearerCredential: string;
    readonly harnessName: string;
    readonly ancestryKey: string;
  },
): Promise<
  | { ok: true; envelope: SuccessEnvelope<RegisterAgentSessionData> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const { response, body } = await postAuthorizedJson(
    base,
    "/v1/session/agent/register",
    input.bearerCredential,
    { harnessName: input.harnessName, ancestryKey: input.ancestryKey },
  );
  const envelope = parseEnvelope<RegisterAgentSessionData>(body);
  if (!response.ok || !envelope.ok) {
    return {
      ok: false,
      envelope: !envelope.ok
        ? envelope
        : {
            ok: false,
            error: { code: "api.error", message: "register failed", retryable: false },
          },
      httpStatus: response.status,
    };
  }
  return { ok: true, envelope };
}
