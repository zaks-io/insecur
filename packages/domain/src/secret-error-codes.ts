/** Secret write and possession-check error codes (implementation in the secrets slices). */
export const SECRET_ERROR_CODES = {
  invalidEncoding: "secret.invalid_encoding",
  invalidInputMode: "secret.invalid_input_mode",
  emptyValue: "secret.empty_value",
  inputRequired: "secret.input_required",
  valueTooLarge: "secret.value_too_large",
  /**
   * The URL environment does not belong to the URL project (or does not exist). Collapses
   * not-found and not-owned into one 404 so the write path cannot reveal whether a foreign
   * environment exists, mirroring `injection.grant_denied`.
   */
  coordinateInvalid: "secret.coordinate_invalid",
  /** Possession-check verdict: candidate does not match the stored Current Version (ADR-0080). */
  possessionMismatch: "secret.possession_mismatch",
} as const;

export type SecretErrorCode = (typeof SECRET_ERROR_CODES)[keyof typeof SECRET_ERROR_CODES];
