import type { DisplayName, RuntimePolicyId, RuntimePolicyVersionId } from "@insecur/domain";
import { and, eq, max } from "drizzle-orm";

import {
  runtimeInjectionPolicies,
  runtimeInjectionPolicyVersions,
} from "../db/schema/tenant-secrets.js";
import { isUniqueConstraintViolation } from "../is-unique-constraint-violation.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { RuntimeInjectionPolicyStoreError } from "./errors.js";
import {
  policyRowSelect,
  policyVersionRowSelect,
  requireUpdatedPolicyRow,
  toPolicyRow,
  toPolicyVersionRow,
} from "./runtime-injection-policy-store-rows.js";
import {
  insertPolicyVersion,
  lockPolicyForVersionAppend,
  updatePolicyReturningRow,
} from "./runtime-injection-policy-version-writes.js";
import type {
  CreateRuntimeInjectionPolicyInput,
  PublishRuntimeInjectionPolicyVersionInput,
  RuntimeInjectionPolicyRow,
  RuntimeInjectionPolicyVersionRow,
} from "./types.js";

/**
 * Postgres-backed Runtime Injection Policy metadata store.
 * Policy versions are append-only; callers must not mutate existing version rows.
 */
export class TenantRuntimeInjectionPolicyStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getPolicyById(
    organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
    policyIdValue: RuntimePolicyId,
  ): Promise<RuntimeInjectionPolicyRow | null> {
    const rows = await this.db
      .select(policyRowSelect)
      .from(runtimeInjectionPolicies)
      .where(
        and(
          eq(runtimeInjectionPolicies.id, policyIdValue),
          eq(runtimeInjectionPolicies.orgId, organizationIdValue),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toPolicyRow(row) : null;
  }

  async getPolicyByDisplayName(
    organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
    environmentIdValue: CreateRuntimeInjectionPolicyInput["environmentId"],
    displayName: DisplayName,
  ): Promise<RuntimeInjectionPolicyRow | null> {
    const rows = await this.db
      .select(policyRowSelect)
      .from(runtimeInjectionPolicies)
      .where(
        and(
          eq(runtimeInjectionPolicies.orgId, organizationIdValue),
          eq(runtimeInjectionPolicies.environmentId, environmentIdValue),
          eq(runtimeInjectionPolicies.displayName, displayName),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toPolicyRow(row) : null;
  }

  async getVersionById(
    organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
    policyIdValue: RuntimePolicyId,
    policyVersionIdValue: RuntimePolicyVersionId,
  ): Promise<RuntimeInjectionPolicyVersionRow | null> {
    const rows = await this.db
      .select(policyVersionRowSelect)
      .from(runtimeInjectionPolicyVersions)
      .where(
        and(
          eq(runtimeInjectionPolicyVersions.orgId, organizationIdValue),
          eq(runtimeInjectionPolicyVersions.policyId, policyIdValue),
          eq(runtimeInjectionPolicyVersions.id, policyVersionIdValue),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toPolicyVersionRow(row) : null;
  }

  async getActiveVersion(
    organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
    policyIdValue: RuntimePolicyId,
  ): Promise<RuntimeInjectionPolicyVersionRow | null> {
    const policy = await this.getPolicyById(organizationIdValue, policyIdValue);
    if (!policy?.activeVersionId) {
      return null;
    }
    return this.getVersionById(organizationIdValue, policyIdValue, policy.activeVersionId);
  }

  async createPolicy(input: CreateRuntimeInjectionPolicyInput): Promise<RuntimeInjectionPolicyRow> {
    try {
      await this.db.insert(runtimeInjectionPolicies).values({
        id: input.policyId,
        orgId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        displayName: input.displayName,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new RuntimeInjectionPolicyStoreError(
          "runtime_policy.display_name_in_use",
          "runtime injection policy display name already exists in environment",
        );
      }
      throw error;
    }

    await insertPolicyVersion(this.db, {
      organizationId: input.organizationId,
      policyId: input.policyId,
      policyVersionId: input.policyVersionId,
      displayName: input.displayName,
      version: input.version,
      versionNumber: 1,
    });

    const updated = await updatePolicyReturningRow(this.db, {
      organizationId: input.organizationId,
      policyId: input.policyId,
      values: { activeVersionId: input.policyVersionId },
    });

    return requireUpdatedPolicyRow(updated, "runtime injection policy missing after create");
  }

  async publishVersion(
    input: PublishRuntimeInjectionPolicyVersionInput,
  ): Promise<RuntimeInjectionPolicyRow> {
    const existing = await lockPolicyForVersionAppend(
      this.db,
      input.organizationId,
      input.policyId,
    );
    if (existing.projectId !== input.projectId || existing.environmentId !== input.environmentId) {
      throw new RuntimeInjectionPolicyStoreError(
        "runtime_policy.not_found",
        "runtime injection policy coordinate mismatch",
      );
    }

    const [maxRow] = await this.db
      .select({ maxVersion: max(runtimeInjectionPolicyVersions.versionNumber) })
      .from(runtimeInjectionPolicyVersions)
      .where(eq(runtimeInjectionPolicyVersions.policyId, input.policyId));

    await insertPolicyVersion(this.db, {
      organizationId: input.organizationId,
      policyId: input.policyId,
      policyVersionId: input.policyVersionId,
      displayName: input.displayName,
      version: input.version,
      versionNumber: (maxRow?.maxVersion ?? 0) + 1,
    });

    try {
      const updated = await updatePolicyReturningRow(this.db, {
        organizationId: input.organizationId,
        policyId: input.policyId,
        values: {
          activeVersionId: input.policyVersionId,
          displayName: input.displayName,
        },
      });
      return requireUpdatedPolicyRow(updated, "runtime injection policy missing after publish");
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new RuntimeInjectionPolicyStoreError(
          "runtime_policy.display_name_in_use",
          "runtime injection policy display name already exists in environment",
        );
      }
      throw error;
    }
  }

  async disablePolicy(
    organizationIdValue: CreateRuntimeInjectionPolicyInput["organizationId"],
    policyIdValue: RuntimePolicyId,
    disabledAt: Date,
  ): Promise<RuntimeInjectionPolicyRow> {
    const updated = await updatePolicyReturningRow(this.db, {
      organizationId: organizationIdValue,
      policyId: policyIdValue,
      values: { disabledAt },
    });

    const row = updated[0];
    if (!row) {
      throw new RuntimeInjectionPolicyStoreError(
        "runtime_policy.not_found",
        "runtime injection policy not found",
      );
    }
    return toPolicyRow(row);
  }
}
