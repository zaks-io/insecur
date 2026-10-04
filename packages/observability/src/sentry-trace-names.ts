const HTTP_METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];

export function sentryRouterTraceNames(router: {
  readonly routesByPath: object;
  readonly routesById: object;
}): Set<string> {
  const names = new Set<string>(["GET /healthz"]);
  registerSentryRouteNames(names, Object.keys(router.routesByPath));
  registerSentryRouteNames(
    names,
    Object.keys(router.routesById).filter((id) => id !== "__root__"),
  );
  return names;
}

/** Register router-owned templates, never paths taken from an incoming request. */
export function registerSentryRouteNames(names: Set<string>, paths: Iterable<string>): void {
  for (const path of paths) {
    names.add(path);
    for (const method of HTTP_METHODS) names.add(`${method} ${path}`);
  }
}
