import {
  secretId,
  secretVersionId,
  type EnvironmentId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";

export interface DraftPromotionTarget {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
}

/**
 * Resolves a Draft Version as a promotion target only when it belongs to the given Protected
 * Environment. Returns null when the version is missing, not a Draft, or its secret lives in a
 * different Environment. This is the DB-enforced guard against cross-environment Draft smuggling
 * into a Promotion Change Set (ADR-0017).
 */
export async function resolveDraftPromotionTargetInEnvironment(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    environmentId: EnvironmentId;
    secretVersionId: SecretVersionId;
  },
): Promise<DraftPromotionTarget | null> {
  const rows = await db
    .select({
      secretId: secrets.id,
      secretVersionId: secretVersions.id,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        eq(secretVersions.id, input.secretVersionId),
        eq(secrets.environmentId, input.environmentId),
        eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    secretId: secretId.brand(row.secretId),
    secretVersionId: secretVersionId.brand(row.secretVersionId),
  };
}
