/**
 * Stable dotted vocabulary shared across audit denial metadata and operation
 * intents/progress reason codes (e.g. `auth.insufficient_scope`, `sync.run`).
 */
export const STABLE_DOTTED_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export const STABLE_DOTTED_CODE_MAX_LENGTH = 128;

export function isStableDottedCode(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= STABLE_DOTTED_CODE_MAX_LENGTH &&
    STABLE_DOTTED_CODE_PATTERN.test(value)
  );
}
