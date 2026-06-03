import type { UserActor } from "@insecur/auth";
import type { AuditActorRef } from "@insecur/audit";
import type { ActorRef } from "@insecur/access";

export function toAuditActor(actor: UserActor): AuditActorRef {
  return { type: "user", userId: actor.userId };
}

export function toAccessActor(actor: UserActor): ActorRef {
  return { type: "user", userId: actor.userId };
}
