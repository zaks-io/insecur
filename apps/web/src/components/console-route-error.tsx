import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { isConsoleUnavailable } from "../console/unavailable.js";
import { runConsoleUnavailableRetry } from "../console/unavailable-retry.js";
import { ConsoleUnavailableSurface } from "./console-unavailable-surface.js";

function rethrowRouteError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Unhandled route error", { cause: error });
}

function useConsoleUnavailableRetry(reset: () => void): () => void {
  const router = useRouter();
  return () => {
    runConsoleUnavailableRetry(reset, () => {
      void router.invalidate();
    });
  };
}

/** Route error boundary: maps the console outage throwable to the retry surface (INS-415). */
export function ConsoleRouteError({ error, reset }: ErrorComponentProps) {
  const onRetry = useConsoleUnavailableRetry(reset);
  if (isConsoleUnavailable(error)) {
    return <ConsoleUnavailableSurface onRetry={onRetry} />;
  }
  rethrowRouteError(error);
}

/** In-shell variant for org-scoped reads under ConsoleFrame. */
export function ConsoleFramedRouteError({ error, reset }: ErrorComponentProps) {
  const onRetry = useConsoleUnavailableRetry(reset);
  if (isConsoleUnavailable(error)) {
    return <ConsoleUnavailableSurface onRetry={onRetry} framed />;
  }
  rethrowRouteError(error);
}
