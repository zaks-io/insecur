/** Stable dotted vocabulary for operation intents and progress reason codes. */
export const STABLE_DOTTED_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export const STABLE_DOTTED_CODE_MAX_LENGTH = 128;

export function isStableDottedCode(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= STABLE_DOTTED_CODE_MAX_LENGTH &&
    STABLE_DOTTED_CODE_PATTERN.test(value)
  );
}
