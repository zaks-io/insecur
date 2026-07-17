import {
  deliveryRiskPolicyId,
  environmentId,
  organizationId,
  previewAutomationOptInId,
  projectId,
  userId,
  type DeliveryRiskPolicyPreset,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  deliveryRiskPolicies,
  previewAutomationOptIns,
} from "../db/schema/tenant-delivery-policy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type {
  DeliveryRiskPolicyRow,
  EnablePreviewAutomationOptInInput,
  PreviewAutomationOptInRow,
  RevokePreviewAutomationOptInInput,
  UpsertDeliveryRiskPolicyInput,
} from "./types.js";

interface RawDeliveryRiskPolicyRow {
  id: string;
  orgId: string;
  projectId: string;
  presetKey: string;
  presetVersion: number;
  policyVersion: number;
  selectedByUserId: string;
  selectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toDeliveryRiskPolicyRow(row: RawDeliveryRiskPolicyRow): DeliveryRiskPolicyRow {
  return {
    id: deliveryRiskPolicyId.brand(row.id),
    organizationId: organizationId.brand(row.orgId),
    projectId: projectId.brand(row.projectId),
    presetKey: row.presetKey as DeliveryRiskPolicyPreset,
    presetVersion: row.presetVersion,
    policyVersion: row.policyVersion,
    selectedByUserId: userId.brand(row.selectedByUserId),
    selectedAt: row.selectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface RawPreviewAutomationOptInRow {
  id: string;
  orgId: string;
  projectId: string;
  environmentId: string;
  enabledByUserId: string;
  enabledAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPreviewAutomationOptInRow(row: RawPreviewAutomationOptInRow): PreviewAutomationOptInRow {
  return {
    id: previewAutomationOptInId.brand(row.id),
    organizationId: organizationId.brand(row.orgId),
    projectId: projectId.brand(row.projectId),
    environmentId: environmentId.brand(row.environmentId),
    enabledByUserId: userId.brand(row.enabledByUserId),
    enabledAt: row.enabledAt,
    revokedAt: row.revokedAt,
    revokedByUserId: row.revokedByUserId === null ? null : userId.brand(row.revokedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Tenant-qualified Delivery Risk Policy and Preview Automation Opt-In store (ADR-0043, INS-88).
 * Callers must gate mutations with Effective Access and step-up rules before invoking writes.
 */
export class TenantDeliveryPolicyStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getPolicyByProject(
    organizationIdValue: OrganizationId,
    projectIdValue: ProjectId,
  ): Promise<DeliveryRiskPolicyRow | null> {
    const rows = await this.db
      .select()
      .from(deliveryRiskPolicies)
      .where(
        and(
          eq(deliveryRiskPolicies.orgId, organizationIdValue),
          eq(deliveryRiskPolicies.projectId, projectIdValue),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toDeliveryRiskPolicyRow(row) : null;
  }

  /**
   * Creates the Project's policy record or applies a preset change to the existing one,
   * incrementing `policyVersion` so every change is a distinct, auditable revision.
   */
  async upsertPolicy(input: UpsertDeliveryRiskPolicyInput): Promise<DeliveryRiskPolicyRow> {
    const now = new Date();
    await this.db
      .insert(deliveryRiskPolicies)
      .values({
        id: input.policyId,
        orgId: input.organizationId,
        projectId: input.projectId,
        presetKey: input.presetKey,
        presetVersion: input.presetVersion,
        policyVersion: 1,
        selectedByUserId: input.selectedByUserId,
        selectedAt: now,
      })
      .onConflictDoUpdate({
        target: [deliveryRiskPolicies.orgId, deliveryRiskPolicies.projectId],
        set: {
          presetKey: input.presetKey,
          presetVersion: input.presetVersion,
          policyVersion: sql`${deliveryRiskPolicies.policyVersion} + 1`,
          selectedByUserId: input.selectedByUserId,
          selectedAt: now,
          updatedAt: now,
        },
      });

    const updated = await this.getPolicyByProject(input.organizationId, input.projectId);
    if (!updated) {
      throw new Error("delivery risk policy row missing after upsert");
    }
    return updated;
  }

  async getPreviewOptInByEnvironment(
    organizationIdValue: OrganizationId,
    environmentIdValue: EnvironmentId,
  ): Promise<PreviewAutomationOptInRow | null> {
    const rows = await this.db
      .select()
      .from(previewAutomationOptIns)
      .where(
        and(
          eq(previewAutomationOptIns.orgId, organizationIdValue),
          eq(previewAutomationOptIns.environmentId, environmentIdValue),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toPreviewAutomationOptInRow(row) : null;
  }

  /** Enables (or re-enables) the per-Environment opt-in, refreshing who/when metadata. */
  async enablePreviewOptIn(
    input: EnablePreviewAutomationOptInInput,
  ): Promise<PreviewAutomationOptInRow> {
    const now = new Date();
    await this.db
      .insert(previewAutomationOptIns)
      .values({
        id: input.optInId,
        orgId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        enabledByUserId: input.enabledByUserId,
        enabledAt: now,
      })
      .onConflictDoUpdate({
        target: [previewAutomationOptIns.orgId, previewAutomationOptIns.environmentId],
        set: {
          enabledByUserId: input.enabledByUserId,
          enabledAt: now,
          revokedAt: null,
          revokedByUserId: null,
          updatedAt: now,
        },
      });

    const updated = await this.getPreviewOptInByEnvironment(
      input.organizationId,
      input.environmentId,
    );
    if (!updated) {
      throw new Error("preview automation opt-in row missing after upsert");
    }
    return updated;
  }

  /** Revokes the active opt-in; returns null when no active opt-in exists (caller fails closed). */
  async revokePreviewOptIn(
    input: RevokePreviewAutomationOptInInput,
  ): Promise<PreviewAutomationOptInRow | null> {
    const now = new Date();
    const rows = await this.db
      .update(previewAutomationOptIns)
      .set({
        revokedAt: now,
        revokedByUserId: input.revokedByUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(previewAutomationOptIns.orgId, input.organizationId),
          eq(previewAutomationOptIns.environmentId, input.environmentId),
          isNull(previewAutomationOptIns.revokedAt),
        ),
      )
      .returning();

    const row = rows[0];
    return row ? toPreviewAutomationOptInRow(row) : null;
  }
}
