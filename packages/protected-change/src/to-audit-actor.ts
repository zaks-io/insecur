import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";

export function toAuditActor(actor: ActorRef): AuditActorRef {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  return { type: "machine", machineIdentityId: actor.machineIdentityId };
}
