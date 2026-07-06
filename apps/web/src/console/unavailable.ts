/** Thrown by console loaders when the session is valid but the API hop is unreachable. */
export class ConsoleUnavailable extends Error {
  constructor() {
    super("Console service unavailable");
    this.name = "ConsoleUnavailable";
  }
}

export function throwConsoleUnavailable(): never {
  throw new ConsoleUnavailable();
}

export function isConsoleUnavailable(error: unknown): error is ConsoleUnavailable {
  return error instanceof ConsoleUnavailable;
}
