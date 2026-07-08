import type { AuthApiClient, CliSessionExchangeData } from "./auth-api-types.js";
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
