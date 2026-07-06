/** Stable wire message for outage errors after ShallowErrorPlugin SSR rehydration. */
export const CONSOLE_UNAVAILABLE_MESSAGE = "insecur:console-unavailable" as const;

/** Hydration-stable outage marker on the throwable and on rehydrated errors (INS-415). */
export interface ConsoleUnavailableError {
  readonly isConsoleUnavailable: true;
}

export class ConsoleUnavailable extends Error implements ConsoleUnavailableError {
  readonly isConsoleUnavailable = true as const;

  constructor() {
    super(CONSOLE_UNAVAILABLE_MESSAGE);
    this.name = "ConsoleUnavailable";
  }
}

export function throwConsoleUnavailable(): never {
  throw new ConsoleUnavailable();
}

export function isConsoleUnavailable(error: unknown): error is ConsoleUnavailableError {
  if (typeof error === "object" && error !== null && "isConsoleUnavailable" in error) {
    return (error as ConsoleUnavailableError).isConsoleUnavailable;
  }
  return error instanceof Error && error.message === CONSOLE_UNAVAILABLE_MESSAGE;
}
