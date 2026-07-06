import type { ErrorComponentProps } from "@tanstack/react-router";
import { isConsoleUnavailable } from "../console/unavailable.js";
import { ConsoleUnavailableSurface } from "./console-unavailable-surface.js";

function rethrowRouteError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Unhandled route error", { cause: error });
}

/** Route error boundary: maps the console outage throwable to the retry surface (INS-415). */
export function ConsoleRouteError({ error, reset }: ErrorComponentProps) {
  if (isConsoleUnavailable(error)) {
    return <ConsoleUnavailableSurface onRetry={reset} />;
  }
  rethrowRouteError(error);
}

/** In-shell variant for org-scoped reads under ConsoleFrame. */
export function ConsoleFramedRouteError({ error, reset }: ErrorComponentProps) {
  if (isConsoleUnavailable(error)) {
    return <ConsoleUnavailableSurface onRetry={reset} framed />;
  }
  rethrowRouteError(error);
}
