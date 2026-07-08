import type { ActorRef } from "@insecur/access";
import type { recordApprovalAudit } from "@insecur/audit";

export function toAuditActor(actor: ActorRef): Parameters<typeof recordApprovalAudit>[0]["actor"] {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  return { type: "machine", machineIdentityId: actor.machineIdentityId };
}
