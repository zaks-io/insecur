import type { OrganizationId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { runtimeInjectionPolicyVersions } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { EnvironmentRuntimeInjectionImpactFact } from "./load-environment-delivery-impact-facts.js";

async function loadActiveRuntimeInjectionPolicyVersion(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly policyId: string;
    readonly activeVersionId: string;
  },
) {
  const [versionRow] = await db
    .select({
      commandFingerprint: runtimeInjectionPolicyVersions.commandFingerprint,
      deliveryMode: runtimeInjectionPolicyVersions.deliveryMode,
      secretIds: runtimeInjectionPolicyVersions.secretIds,
      ttlSeconds: runtimeInjectionPolicyVersions.ttlSeconds,
    })
    .from(runtimeInjectionPolicyVersions)
    .where(
      and(
        eq(runtimeInjectionPolicyVersions.orgId, input.organizationId),
        eq(runtimeInjectionPolicyVersions.policyId, input.policyId),
        eq(runtimeInjectionPolicyVersions.id, input.activeVersionId),
      ),
    )
    .limit(1);

  return versionRow;
}

export async function loadRuntimeInjectionPolicyImpactFact(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly policyId: string;
    readonly activeVersionId: string;
  },
): Promise<EnvironmentRuntimeInjectionImpactFact | null> {
  const versionRow = await loadActiveRuntimeInjectionPolicyVersion(db, input);
  if (!versionRow) {
    return null;
  }

  return {
    policyId: input.policyId,
    activeVersionId: input.activeVersionId,
    commandFingerprint: versionRow.commandFingerprint ?? "",
    deliveryMode: versionRow.deliveryMode,
    secretIds: [...versionRow.secretIds].sort(),
    ttlSeconds: versionRow.ttlSeconds,
  };
}
