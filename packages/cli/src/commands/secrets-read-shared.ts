import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireSecretReadScope, type ResolvedSecretReadScope } from "./secrets-read-scope.js";

export async function withSecretReadSession<T>(
  context: ResolvedCliContext,
  run: (input: { credential: string; readScope: ResolvedSecretReadScope }) => Promise<T>,
): Promise<T> {
  const credential = await requireSessionCredential(context.scope.host);
  const readScope = requireSecretReadScope(context.scope);
  return run({ credential, readScope });
}

export function buildSecretReadApiInput(
  context: ResolvedCliContext,
  credential: string,
  readScope: ResolvedSecretReadScope,
): {
  host: string;
  bearerCredential: string;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
} {
  return {
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: readScope.orgId,
    projectId: readScope.projectId,
    environmentId: readScope.envId,
  };
}

export interface SecretReadCommandDeps {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
}
