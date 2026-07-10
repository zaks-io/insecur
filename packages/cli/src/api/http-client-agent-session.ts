import type { DeriveAgentSessionData, RegisterAgentSessionData } from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import {
  parseEnvelope,
  postAuthorizedJson,
  readCliCredentialHeader,
  type HttpClientOptions,
} from "./http-client-envelope.js";

type DeriveAgentSessionHttpInput = Parameters<typeof deriveAgentSession>[1];

function deriveAgentSessionBody(input: DeriveAgentSessionHttpInput): Record<string, unknown> {
  return {
    ...(input.harnessName === undefined ? {} : { harnessName: input.harnessName }),
    ...(input.credentialScopes === undefined ? {} : { credentialScopes: input.credentialScopes }),
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
    ...(input.ttlSeconds === undefined ? {} : { ttlSeconds: input.ttlSeconds }),
  };
}

export async function deriveAgentSession(
  base: string,
  input: {
    readonly bearerCredential: string;
    readonly harnessName?: string;
    readonly credentialScopes?: readonly string[];
    readonly organizationId?: string;
    readonly projectId?: string;
    readonly environmentId?: string;
    readonly ttlSeconds?: number;
  },
  options?: HttpClientOptions,
): Promise<
  | { ok: true; envelope: SuccessEnvelope<DeriveAgentSessionData>; credential: string }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const { response, body } = await postAuthorizedJson(
    base,
    "/v1/session/agent/derive",
    input.bearerCredential,
    {
      body: deriveAgentSessionBody(input),
      options,
    },
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
  options?: HttpClientOptions,
): Promise<
  | { ok: true; envelope: SuccessEnvelope<RegisterAgentSessionData> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const { response, body } = await postAuthorizedJson(
    base,
    "/v1/session/agent/register",
    input.bearerCredential,
    { body: { harnessName: input.harnessName, ancestryKey: input.ancestryKey }, options },
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
