import type {
  OrganizationId,
  WebhookSigningSecretId,
  WebhookSubscriptionId,
} from "@insecur/domain";
import { toStoreFacingCiphertext } from "@insecur/custody-contracts";
import { and, eq } from "drizzle-orm";

import { webhookSigningSecrets } from "../db/schema/tenant-webhooks.js";
import { decodeStoredWrappedMaterial } from "../decode-stored-wrapped-material.js";
import { encodeInlineCiphertextStorageRef } from "../secrets/ciphertext-storage-ref.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { UpsertWebhookSigningSecretInput, WebhookSigningSecretRow } from "./types.js";

const signingSecretSelectShape = {
  id: webhookSigningSecrets.id,
  org_id: webhookSigningSecrets.orgId,
  subscription_id: webhookSigningSecrets.subscriptionId,
  organization_data_key_version: webhookSigningSecrets.organizationDataKeyVersion,
  ciphertext_storage_ref: webhookSigningSecrets.ciphertextStorageRef,
  status: webhookSigningSecrets.status,
  retired_at: webhookSigningSecrets.retiredAt,
} as const;

interface SigningSecretSelectedRow {
  id: string;
  subscription_id: string;
  organization_data_key_version: number;
  ciphertext_storage_ref: string;
  status: string;
  retired_at: Date | null;
}

export class TenantWebhookSigningSecretStore {
  constructor(private readonly db: TenantScopedDb) {}

  async insertSecret(input: UpsertWebhookSigningSecretInput): Promise<void> {
    const storageRef = encodeInlineCiphertextStorageRef(toStoreFacingCiphertext(input.wrapped));
    await this.db.insert(webhookSigningSecrets).values({
      id: input.signingSecretId,
      orgId: input.organizationId,
      subscriptionId: input.subscriptionId,
      organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
      ciphertextStorageRef: storageRef,
      status: "active",
    });
  }

  async retireSecret(
    organizationId: OrganizationId,
    signingSecretId: WebhookSigningSecretId,
  ): Promise<void> {
    await this.db
      .update(webhookSigningSecrets)
      .set({ status: "retired", retiredAt: new Date() })
      .where(
        and(
          eq(webhookSigningSecrets.orgId, organizationId),
          eq(webhookSigningSecrets.id, signingSecretId),
        ),
      );
  }

  async getActiveSecret(
    organizationId: OrganizationId,
    subscriptionId: WebhookSubscriptionId,
  ): Promise<WebhookSigningSecretRow | null> {
    return this.fetchSigningSecretRow(organizationId, [
      eq(webhookSigningSecrets.orgId, organizationId),
      eq(webhookSigningSecrets.subscriptionId, subscriptionId),
      eq(webhookSigningSecrets.status, "active"),
    ]);
  }

  async getSecret(
    organizationId: OrganizationId,
    signingSecretId: WebhookSigningSecretId,
  ): Promise<WebhookSigningSecretRow | null> {
    return this.fetchSigningSecretRow(organizationId, [
      eq(webhookSigningSecrets.orgId, organizationId),
      eq(webhookSigningSecrets.id, signingSecretId),
    ]);
  }

  private async fetchSigningSecretRow(
    organizationId: OrganizationId,
    filters: readonly ReturnType<typeof eq>[],
  ): Promise<WebhookSigningSecretRow | null> {
    const rows = await this.db
      .select(signingSecretSelectShape)
      .from(webhookSigningSecrets)
      .where(and(...filters));
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.toRow(organizationId, row);
  }

  private toRow(
    organizationId: OrganizationId,
    row: SigningSecretSelectedRow,
  ): WebhookSigningSecretRow {
    return {
      id: row.id as WebhookSigningSecretId,
      organizationId,
      subscriptionId: row.subscription_id as WebhookSubscriptionId,
      status: row.status as WebhookSigningSecretRow["status"],
      retiredAt: row.retired_at,
      wrapped: decodeStoredWrappedMaterial(
        {
          organizationDataKeyVersion: row.organization_data_key_version,
          ciphertextStorageRef: row.ciphertext_storage_ref,
        },
        { material: "provider-credential" },
      ),
    };
  }
}
