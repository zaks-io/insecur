/**
 * Stable dotted result/error codes used in audit denial metadata.
 * Matches the repo vocabulary (`auth.insufficient_scope`, `secret.invalid_encoding`, …).
 */
export const STABLE_DOTTED_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export const STABLE_DOTTED_ERROR_CODE_MAX_LENGTH = 128;

export function isStableDottedErrorCode(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= STABLE_DOTTED_ERROR_CODE_MAX_LENGTH &&
    STABLE_DOTTED_ERROR_CODE_PATTERN.test(value)
  );
}
