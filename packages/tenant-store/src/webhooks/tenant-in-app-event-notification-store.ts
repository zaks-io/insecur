import type {
  InAppEventNotificationId,
  OrganizationId,
  WebhookSubscriptionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { inAppEventNotifications } from "../db/schema/tenant-webhooks.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export interface InsertInAppEventNotificationInput {
  readonly organizationId: OrganizationId;
  readonly notificationId: InAppEventNotificationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly webhookEventCode: string;
  readonly envelopePayload: string;
  readonly signature: string;
  readonly signatureTimestamp: Date;
}

export class TenantInAppEventNotificationStore {
  constructor(private readonly db: TenantScopedDb) {}

  async insert(input: InsertInAppEventNotificationInput): Promise<void> {
    await this.db.insert(inAppEventNotifications).values({
      id: input.notificationId,
      orgId: input.organizationId,
      subscriptionId: input.subscriptionId,
      webhookEventCode: input.webhookEventCode,
      envelopePayload: input.envelopePayload,
      signature: input.signature,
      signatureTimestamp: input.signatureTimestamp,
    });
  }

  async listForSubscription(
    organizationId: OrganizationId,
    subscriptionId: WebhookSubscriptionId,
  ): Promise<
    readonly {
      notificationId: InAppEventNotificationId;
      webhookEventCode: string;
      envelopePayload: string;
      signature: string;
      signatureTimestamp: Date;
      createdAt: Date;
    }[]
  > {
    const rows = await this.db
      .select()
      .from(inAppEventNotifications)
      .where(
        and(
          eq(inAppEventNotifications.orgId, organizationId),
          eq(inAppEventNotifications.subscriptionId, subscriptionId),
        ),
      );
    return rows.map((row) => ({
      notificationId: row.id as InAppEventNotificationId,
      webhookEventCode: row.webhookEventCode,
      envelopePayload: row.envelopePayload,
      signature: row.signature,
      signatureTimestamp: row.signatureTimestamp,
      createdAt: row.createdAt,
    }));
  }
}
