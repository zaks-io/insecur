import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { and, eq, isNull } from "drizzle-orm";

import { runtimeInjectionPolicies } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { loadRuntimeInjectionPolicyImpactFact } from "./load-runtime-injection-policy-impact-fact.js";

export interface EnvironmentRuntimeInjectionImpactFact {
  readonly policyId: string;
  readonly activeVersionId: string;
  readonly commandFingerprint: string;
  readonly deliveryMode: string;
  readonly secretIds: readonly string[];
  readonly ttlSeconds: number;
}

export interface EnvironmentDeliveryImpactFacts {
  readonly runtimeInjectionPolicies: readonly EnvironmentRuntimeInjectionImpactFact[];
  /** Extension point for W8 provider Secret Sync impact (INS-77); empty in V1 core review. */
  readonly providerSyncImpact: readonly string[];
}

export async function loadEnvironmentDeliveryImpactFacts(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  },
): Promise<EnvironmentDeliveryImpactFacts> {
  const policyRows = await db
    .select({
      policyId: runtimeInjectionPolicies.id,
      activeVersionId: runtimeInjectionPolicies.activeVersionId,
    })
    .from(runtimeInjectionPolicies)
    .where(
      and(
        eq(runtimeInjectionPolicies.orgId, input.organizationId),
        eq(runtimeInjectionPolicies.projectId, input.projectId),
        eq(runtimeInjectionPolicies.environmentId, input.environmentId),
        isNull(runtimeInjectionPolicies.disabledAt),
      ),
    );

  const runtimeInjectionPolicyFacts: EnvironmentRuntimeInjectionImpactFact[] = [];
  for (const policyRow of policyRows) {
    const activeVersionId = policyRow.activeVersionId;
    if (activeVersionId === null) {
      continue;
    }
    const fact = await loadRuntimeInjectionPolicyImpactFact(db, {
      organizationId: input.organizationId,
      policyId: policyRow.policyId,
      activeVersionId,
    });
    if (fact !== null) {
      runtimeInjectionPolicyFacts.push(fact);
    }
  }

  runtimeInjectionPolicyFacts.sort((left, right) => left.policyId.localeCompare(right.policyId));

  return {
    runtimeInjectionPolicies: runtimeInjectionPolicyFacts,
    providerSyncImpact: [],
  };
}
