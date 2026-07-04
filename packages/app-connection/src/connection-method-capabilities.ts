import type { AppConnectionMethod } from "@insecur/tenant-store";

const CREDENTIAL_BACKED_METHODS = new Set<AppConnectionMethod>([
  "scoped-api-token",
  "vercel-integration-oauth",
]);

export function connectionMethodRequiresStoredCredential(
  connectionMethod: AppConnectionMethod,
): boolean {
  return CREDENTIAL_BACKED_METHODS.has(connectionMethod);
}

export function connectionMethodUsesProviderAppRegistration(
  connectionMethod: AppConnectionMethod,
): boolean {
  return connectionMethod === "github-app" || connectionMethod === "vercel-integration-oauth";
}
