import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface CliSessionExchangeData {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly agentSessionId?: string;
}

interface CliAuthorizationUrlInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}

export interface CliDeviceAuthorizationData {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
}

/** One device-token poll result: pending, slow_down, terminal error envelope, or authenticated. */
export type CliDeviceTokenPollResult =
  | { ok: true; status: "authorization_pending" | "slow_down" }
  | {
      ok: true;
      status: "authenticated";
      credential: string;
      envelope: ApiSuccess<CliSessionExchangeData>;
    }
  | { ok: false; envelope: ApiFailure; httpStatus: number };

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
  startCliDeviceAuthorization(input: {
    readonly host: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<CliDeviceAuthorizationData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  pollCliDeviceToken(input: {
    readonly host: string;
    readonly deviceCode: string;
    readonly agentSession: boolean;
  }): Promise<CliDeviceTokenPollResult>;
}
