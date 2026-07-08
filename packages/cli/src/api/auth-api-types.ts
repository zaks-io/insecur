import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface CliSessionExchangeData {
  readonly sessionId: string;
  readonly expiresAt: string;
}

interface CliAuthorizationUrlInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}

export interface AuthApiClient {
  createCliAuthorizationUrl(input: CliAuthorizationUrlInput): string;
  exchangeCliPkceSession(input: {
    readonly host: string;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<
    | { ok: true; credential: string; envelope: ApiSuccess<CliSessionExchangeData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
