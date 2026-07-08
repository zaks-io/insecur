import type { ActorRef } from "@insecur/access";
import type { ApprovalRequestRequester } from "@insecur/tenant-store";

/**
 * Maps an authorized actor to the Approval Request requester binding persisted on the row.
 * Per the ADR-0032 amendment, Agents (Machine Identities) may create Approval Requests, so
 * both user and machine actors are supported; approval itself remains human-only.
 */
export function requesterFromActor(actor: ActorRef): ApprovalRequestRequester {
  if (actor.type === "user") {
    return { userId: actor.userId };
  }
  return { machineIdentityId: actor.machineIdentityId };
}
