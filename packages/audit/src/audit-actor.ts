import type { MachineIdentityId, UserId } from "@insecur/domain";
import type { AuditActorRef, AuditEventActorRef } from "./audit-types.js";

/** Returns the User ID when the audit actor is a human User; otherwise null. */
export function auditActorUserId(actor: AuditActorRef): UserId | null {
  return actor.type === "user" ? actor.userId : null;
}

/** Returns the Machine Identity ID when the audit actor is a machine; otherwise null. */
export function auditActorMachineIdentityId(actor: AuditActorRef): MachineIdentityId | null {
  return actor.type === "machine" ? actor.machineIdentityId : null;
}

/** Maps any audit actor kind to the persisted event actor coordinate. */
export function auditActorToEventActorRef(actor: AuditActorRef): AuditEventActorRef {
  switch (actor.type) {
    case "user":
      return { type: "user", userId: actor.userId };
    case "machine":
      return { type: "machine", machineIdentityId: actor.machineIdentityId };
    case "ci_exchange":
      return { type: "ci_exchange" };
  }
}
