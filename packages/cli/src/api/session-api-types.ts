import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface SessionApiClient {
  revokeCliSession(input: {
    readonly host: string;
    readonly bearerCredential: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<{ readonly revoked: boolean }> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
