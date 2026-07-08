import { and, asc, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export async function loadSecretsWithCurrentVersionJoin(
  db: TenantScopedDb,
  whereClause: ReturnType<typeof and>,
): Promise<
  readonly {
    secretId: string;
    environmentId: string;
    variableKey: string;
    secretCreatedAt: Date;
    currentVersionId: string | null;
    versionId: string | null;
    versionNumber: number | null;
    lifecycleState: string | null;
    versionCreatedAt: Date | null;
    publishedAt: Date | null;
  }[]
> {
  return db
    .select({
      secretId: secrets.id,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
      secretCreatedAt: secrets.createdAt,
      currentVersionId: secrets.currentVersionId,
      versionId: secretVersions.id,
      versionNumber: secretVersions.versionNumber,
      lifecycleState: secretVersions.lifecycleState,
      versionCreatedAt: secretVersions.createdAt,
      publishedAt: secretVersions.publishedAt,
    })
    .from(secrets)
    .leftJoin(
      secretVersions,
      and(eq(secrets.orgId, secretVersions.orgId), eq(secrets.currentVersionId, secretVersions.id)),
    )
    .where(whereClause)
    .orderBy(asc(secrets.variableKey), asc(secrets.environmentId));
}
