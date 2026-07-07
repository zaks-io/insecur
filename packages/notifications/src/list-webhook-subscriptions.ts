import type { ActorRef } from "@insecur/access";
import type { OrganizationId } from "@insecur/domain";
import { TenantWebhookSubscriptionStore, withTenantScope } from "@insecur/tenant-store";

import { assertWebhookReadAccess, toReadPayload } from "./webhook-subscription-shared.js";

export async function listWebhookSubscriptions(input: {
  readonly organizationId: OrganizationId;
  readonly accessActor: ActorRef;
}) {
  await assertWebhookReadAccess(input.accessActor, input.organizationId);
  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => new TenantWebhookSubscriptionStore(db).list(input.organizationId),
  );
  return rows.map((row) => toReadPayload(row));
}
