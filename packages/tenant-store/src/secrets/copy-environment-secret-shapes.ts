import {
  secretId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import { and, asc, eq } from "drizzle-orm";

import { secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

async function listVariableKeysForEnvironment(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
): Promise<readonly VariableKey[]> {
  const rows = await db
    .select({ variableKey: secrets.variableKey })
    .from(secrets)
    .where(
      and(
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        eq(secrets.environmentId, input.environmentId),
      ),
    )
    .orderBy(asc(secrets.variableKey));

  return rows.map((row) => row.variableKey as VariableKey);
}

/**
 * Copies Secret Shapes (variable keys only) from one environment into another.
 * Never copies Secret Versions or Sensitive Values.
 */
export async function copyEnvironmentSecretShapes(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    sourceEnvironmentId: EnvironmentId;
    targetEnvironmentId: EnvironmentId;
  },
): Promise<number> {
  const sourceKeys = await listVariableKeysForEnvironment(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.sourceEnvironmentId,
  });
  if (sourceKeys.length === 0) {
    return 0;
  }

  const targetKeys = new Set(
    await listVariableKeysForEnvironment(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.targetEnvironmentId,
    }),
  );

  let copied = 0;
  for (const variableKey of sourceKeys) {
    if (targetKeys.has(variableKey)) {
      continue;
    }
    await db.insert(secrets).values({
      id: secretId.generate(),
      orgId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.targetEnvironmentId,
      variableKey,
      currentVersionId: null,
    });
    copied += 1;
  }
  return copied;
}
