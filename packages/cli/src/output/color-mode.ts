export type ColorFlag = "always" | "never" | undefined;

export interface ColorModeInput {
  readonly flag: ColorFlag;
  readonly forceColor: string | undefined;
  readonly noColor: string | undefined;
  readonly term: string | undefined;
  readonly isTTY: boolean;
}

function forceColorEnabled(value: string): boolean {
  return value !== "0" && value.toLowerCase() !== "false";
}

/**
 * Resolve whether ANSI color should be emitted. Pure: reads only its input,
 * never process/env directly, so it is table-testable. JSON safety is applied
 * separately at the install point (configureColor forces off for --json).
 * Precedence, highest first: explicit flag, FORCE_COLOR, NO_COLOR, dumb term, TTY.
 */
export function resolveColorEnabled(input: ColorModeInput): boolean {
  if (input.flag === "never") {
    return false;
  }
  if (input.flag === "always") {
    return true;
  }
  if (input.forceColor !== undefined && forceColorEnabled(input.forceColor)) {
    return true;
  }
  if (input.noColor !== undefined) {
    return false;
  }
  if (input.term === "dumb") {
    return false;
  }
  return input.isTTY;
}
