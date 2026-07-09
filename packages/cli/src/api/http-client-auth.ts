import type {
  AuthApiClient,
  CliDeviceAuthorizationData,
  CliDeviceTokenPollResult,
  CliSessionExchangeData,
} from "./auth-api-types.js";
import { parseEnvelope, postJson, readCliCredentialHeader } from "./http-client-envelope.js";

export function createCliAuthorizationUrl(
  base: string,
  input: Parameters<AuthApiClient["createCliAuthorizationUrl"]>[0],
): string {
  const url = new URL("/v1/auth/cli/authorize", base);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
  return url.toString();
}

export async function exchangeCliPkceSession(
  base: string,
  input: Parameters<AuthApiClient["exchangeCliPkceSession"]>[0],
) {
  const { response, body } = await postJson(new URL("/v1/auth/cli/pkce/exchange", base), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: input.code,
      codeVerifier: input.codeVerifier,
    }),
  });
  const envelope = parseEnvelope<CliSessionExchangeData>(body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  const credential = readCliCredentialHeader(
    response,
    "CLI PKCE exchange succeeded but session credential header is missing",
  );
  return { ok: true as const, credential, envelope };
}

export async function startCliDeviceAuthorization(base: string) {
  const { response, body } = await postJson(new URL("/v1/auth/cli/device/authorize", base), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const envelope = parseEnvelope<CliDeviceAuthorizationData>(body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

function isPendingStatus(value: unknown): value is "authorization_pending" | "slow_down" {
  return value === "authorization_pending" || value === "slow_down";
}

export async function pollCliDeviceToken(
  base: string,
  input: Parameters<AuthApiClient["pollCliDeviceToken"]>[0],
): Promise<CliDeviceTokenPollResult> {
  const { response, body } = await postJson(new URL("/v1/auth/cli/device/token", base), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ deviceCode: input.deviceCode, agentSession: input.agentSession }),
  });
  const envelope = parseEnvelope<CliSessionExchangeData>(body);
  if (!envelope.ok) {
    return { ok: false, envelope, httpStatus: response.status };
  }
  const status = (envelope.data as { status?: unknown }).status;
  if (isPendingStatus(status)) {
    return { ok: true, status };
  }
  const credential = readCliCredentialHeader(
    response,
    "CLI device exchange succeeded but session credential header is missing",
  );
  return { ok: true, status: "authenticated", credential, envelope };
}
