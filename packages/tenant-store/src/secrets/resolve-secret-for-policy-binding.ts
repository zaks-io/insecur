import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";

export interface ResolveSecretForPolicyBindingInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
}

/**
 * Resolves a secret ID for runtime injection policy binding within the policy's tenant scope.
 * Cross-environment references in the same organization are rejected separately from misses.
 */
export async function resolveSecretForPolicyBinding(
  db: TenantScopedDb,
  input: ResolveSecretForPolicyBindingInput,
): Promise<void> {
  const rows = await db
    .select({
      projectId: secrets.projectId,
      environmentId: secrets.environmentId,
    })
    .from(secrets)
    .where(and(eq(secrets.id, input.secretId), eq(secrets.orgId, input.organizationId)))
    .limit(1);

  const existing = rows[0];
  if (existing?.projectId !== input.projectId) {
    throw new SecretVersionStoreNotFoundError("secret binding not found in policy scope");
  }
  if (existing.environmentId !== input.environmentId) {
    throw new SecretVersionStoreConflictError("secret binding belongs to a different environment");
  }
}
