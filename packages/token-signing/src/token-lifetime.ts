/** Maximum acceptable clock skew for token `iat` future-issuance checks. */
export const TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS = 60;

/** True when `iat` is meaningfully in the future relative to `nowEpochSeconds`. */
export function isTokenIssuedAtInFuture(iat: number, nowEpochSeconds: number): boolean {
  return iat > nowEpochSeconds + TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS;
}
