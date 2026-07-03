import {
  type DisplayName,
  type RuntimePolicyId,
  type RuntimePolicyVersionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import {
  runtimeInjectionPolicies,
  runtimeInjectionPolicyVersions,
} from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { RuntimeInjectionPolicyStoreError } from "./errors.js";
import {
  policyRowSelect,
  serializePolicyBindings,
  toPolicyRow,
  type PolicyRowRecord,
} from "./runtime-injection-policy-store-rows.js";
import type { CreateRuntimeInjectionPolicyInput, RuntimeInjectionPolicyRow } from "./types.js";

export async function lockPolicyForVersionAppend(
  db: TenantScopedDb,
  organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
  policyIdValue: RuntimePolicyId,
): Promise<RuntimeInjectionPolicyRow> {
  const locked = await db
    .select(policyRowSelect)
    .from(runtimeInjectionPolicies)
    .where(
      and(
        eq(runtimeInjectionPolicies.id, policyIdValue),
        eq(runtimeInjectionPolicies.orgId, organizationIdValue),
      ),
    )
    .for("update")
    .limit(1);

  const row = locked[0];
  if (!row) {
    throw new RuntimeInjectionPolicyStoreError(
      "runtime_policy.not_found",
      "runtime injection policy not found",
    );
  }
  return toPolicyRow(row);
}

export async function insertPolicyVersion(
  db: TenantScopedDb,
  input: {
    organizationId: CreateRuntimeInjectionPolicyInput["organizationId"];
    policyId: RuntimePolicyId;
    policyVersionId: RuntimePolicyVersionId;
    displayName: DisplayName;
    version: CreateRuntimeInjectionPolicyInput["version"];
    versionNumber: number;
  },
): Promise<void> {
  const bindings = serializePolicyBindings(input.version.bindings);
  await db.insert(runtimeInjectionPolicyVersions).values({
    id: input.policyVersionId,
    orgId: input.organizationId,
    policyId: input.policyId,
    versionNumber: input.versionNumber,
    displayNameSnapshot: input.displayName,
    secretIds: bindings.secretIds,
    variableKeys: bindings.variableKeys,
    command: input.version.command,
    commandFingerprint: input.version.commandFingerprint ?? null,
    ttlSeconds: input.version.ttlSeconds,
    deliveryMode: input.version.deliveryMode,
  });
}

export async function updatePolicyReturningRow(
  db: TenantScopedDb,
  input: {
    organizationId: CreateRuntimeInjectionPolicyInput["organizationId"];
    policyId: RuntimePolicyId;
    values: Partial<{
      activeVersionId: RuntimePolicyVersionId;
      displayName: DisplayName;
      disabledAt: Date;
    }>;
  },
): Promise<PolicyRowRecord[]> {
  return db
    .update(runtimeInjectionPolicies)
    .set(input.values)
    .where(
      and(
        eq(runtimeInjectionPolicies.id, input.policyId),
        eq(runtimeInjectionPolicies.orgId, input.organizationId),
      ),
    )
    .returning(policyRowSelect);
}
