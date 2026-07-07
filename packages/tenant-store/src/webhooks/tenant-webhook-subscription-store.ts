import type { DisplayName, OrganizationId, UserId, WebhookSubscriptionId } from "@insecur/domain";
import { and, eq, inArray } from "drizzle-orm";

import {
  webhookSubscriptionEventTypes,
  webhookSubscriptions,
  type WEBHOOK_SUBSCRIPTION_STATUSES,
} from "../db/schema/tenant-webhooks.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export type WebhookSubscriptionStatus = (typeof WEBHOOK_SUBSCRIPTION_STATUSES)[number];

export interface WebhookSubscriptionRow {
  readonly subscriptionId: WebhookSubscriptionId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly status: WebhookSubscriptionStatus;
  readonly deliveryEmail: string | null;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
  readonly eventCodes: readonly string[];
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateWebhookSubscriptionInput {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly displayName: DisplayName;
  readonly deliveryEmail?: string;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
  readonly eventCodes: readonly string[];
  readonly createdByUserId: UserId;
}

export interface UpdateWebhookSubscriptionInput {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly displayName?: DisplayName;
  readonly deliveryEmail?: string | null;
  readonly enableEmailChannel?: boolean;
  readonly enableInAppChannel?: boolean;
  readonly eventCodes?: readonly string[];
  readonly status?: WebhookSubscriptionStatus;
}

export class TenantWebhookSubscriptionStore {
  constructor(private readonly db: TenantScopedDb) {}

  async create(input: CreateWebhookSubscriptionInput): Promise<WebhookSubscriptionRow> {
    await this.db.insert(webhookSubscriptions).values({
      id: input.subscriptionId,
      orgId: input.organizationId,
      displayName: input.displayName,
      deliveryEmail: input.deliveryEmail ?? null,
      enableEmailChannel: input.enableEmailChannel,
      enableInAppChannel: input.enableInAppChannel,
      createdByUserId: input.createdByUserId,
    });
    if (input.eventCodes.length > 0) {
      await this.db.insert(webhookSubscriptionEventTypes).values(
        input.eventCodes.map((eventCode) => ({
          orgId: input.organizationId,
          subscriptionId: input.subscriptionId,
          eventCode,
        })),
      );
    }
    const created = await this.get(input.organizationId, input.subscriptionId);
    if (!created) {
      throw new Error("webhook subscription create failed");
    }
    return created;
  }

  async update(input: UpdateWebhookSubscriptionInput): Promise<WebhookSubscriptionRow> {
    await this.applySubscriptionUpdates(input);
    if (input.eventCodes !== undefined) {
      await this.replaceEventCodes(input.organizationId, input.subscriptionId, input.eventCodes);
    }

    const updated = await this.get(input.organizationId, input.subscriptionId);
    if (!updated) {
      throw new Error("webhook subscription update failed");
    }
    return updated;
  }

  private async applySubscriptionUpdates(input: UpdateWebhookSubscriptionInput): Promise<void> {
    const updates: Partial<typeof webhookSubscriptions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.displayName !== undefined) {
      updates.displayName = input.displayName;
    }
    if (input.deliveryEmail !== undefined) {
      updates.deliveryEmail = input.deliveryEmail;
    }
    if (input.enableEmailChannel !== undefined) {
      updates.enableEmailChannel = input.enableEmailChannel;
    }
    if (input.enableInAppChannel !== undefined) {
      updates.enableInAppChannel = input.enableInAppChannel;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }

    await this.db
      .update(webhookSubscriptions)
      .set(updates)
      .where(
        and(
          eq(webhookSubscriptions.orgId, input.organizationId),
          eq(webhookSubscriptions.id, input.subscriptionId),
        ),
      );
  }

  private async replaceEventCodes(
    organizationId: OrganizationId,
    subscriptionId: WebhookSubscriptionId,
    eventCodes: readonly string[],
  ): Promise<void> {
    await this.db
      .delete(webhookSubscriptionEventTypes)
      .where(
        and(
          eq(webhookSubscriptionEventTypes.orgId, organizationId),
          eq(webhookSubscriptionEventTypes.subscriptionId, subscriptionId),
        ),
      );
    if (eventCodes.length === 0) {
      return;
    }
    await this.db.insert(webhookSubscriptionEventTypes).values(
      eventCodes.map((eventCode) => ({
        orgId: organizationId,
        subscriptionId,
        eventCode,
      })),
    );
  }

  async list(organizationId: OrganizationId): Promise<WebhookSubscriptionRow[]> {
    const rows = await this.db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.orgId, organizationId));
    return Promise.all(rows.map((row) => this.hydrateRow(organizationId, row)));
  }

  async listActiveByEventCode(
    organizationId: OrganizationId,
    eventCode: string,
  ): Promise<WebhookSubscriptionRow[]> {
    const matches = await this.db
      .select({ subscriptionId: webhookSubscriptionEventTypes.subscriptionId })
      .from(webhookSubscriptionEventTypes)
      .innerJoin(
        webhookSubscriptions,
        and(
          eq(webhookSubscriptionEventTypes.orgId, webhookSubscriptions.orgId),
          eq(webhookSubscriptionEventTypes.subscriptionId, webhookSubscriptions.id),
        ),
      )
      .where(
        and(
          eq(webhookSubscriptionEventTypes.orgId, organizationId),
          eq(webhookSubscriptionEventTypes.eventCode, eventCode),
          eq(webhookSubscriptions.status, "active"),
        ),
      );
    if (matches.length === 0) {
      return [];
    }
    const subscriptionIds = matches.map((row) => row.subscriptionId as WebhookSubscriptionId);
    const rows = await this.db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.orgId, organizationId),
          inArray(webhookSubscriptions.id, subscriptionIds),
        ),
      );
    return Promise.all(rows.map((row) => this.hydrateRow(organizationId, row)));
  }

  async get(
    organizationId: OrganizationId,
    subscriptionId: WebhookSubscriptionId,
  ): Promise<WebhookSubscriptionRow | null> {
    const rows = await this.db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.orgId, organizationId),
          eq(webhookSubscriptions.id, subscriptionId),
        ),
      );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.hydrateRow(organizationId, row);
  }

  private async hydrateRow(
    organizationId: OrganizationId,
    row: typeof webhookSubscriptions.$inferSelect,
  ): Promise<WebhookSubscriptionRow> {
    const eventTypeRows = await this.db
      .select({ eventCode: webhookSubscriptionEventTypes.eventCode })
      .from(webhookSubscriptionEventTypes)
      .where(
        and(
          eq(webhookSubscriptionEventTypes.orgId, organizationId),
          eq(webhookSubscriptionEventTypes.subscriptionId, row.id),
        ),
      );
    return {
      subscriptionId: row.id as WebhookSubscriptionId,
      organizationId,
      displayName: row.displayName as WebhookSubscriptionRow["displayName"],
      status: row.status as WebhookSubscriptionStatus,
      deliveryEmail: row.deliveryEmail,
      enableEmailChannel: row.enableEmailChannel,
      enableInAppChannel: row.enableInAppChannel,
      eventCodes: eventTypeRows.map((entry) => entry.eventCode),
      createdByUserId: row.createdByUserId as UserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
