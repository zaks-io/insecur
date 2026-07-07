/** Retry a console outage: clear the error boundary, then reload the failed route match. */
export function runConsoleUnavailableRetry(
  reset: () => void,
  invalidate: () => void | Promise<void>,
): void {
  reset();
  void invalidate();
}
