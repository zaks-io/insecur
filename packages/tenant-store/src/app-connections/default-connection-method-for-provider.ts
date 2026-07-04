import type { AppConnectionMethod, AppConnectionProvider } from "./types.js";

/** Default connection method for legacy app_connections rows keyed by provider slug. */
export const DEFAULT_CONNECTION_METHOD_BY_PROVIDER = {
  github: "github-app",
  cloudflare: "scoped-api-token",
  vercel: "vercel-integration-oauth",
} as const satisfies Record<AppConnectionProvider, AppConnectionMethod>;

export function defaultConnectionMethodForProvider(
  provider: AppConnectionProvider,
): AppConnectionMethod {
  return DEFAULT_CONNECTION_METHOD_BY_PROVIDER[provider];
}
