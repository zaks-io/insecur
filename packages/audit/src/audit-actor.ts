import type { UserId } from "@insecur/domain";
import type { AuditActorRef } from "./audit-types.js";

/** Returns the User ID when the audit actor is a human User. */
export function auditActorUserId(actor: AuditActorRef): UserId {
  if (actor.type !== "user") {
    throw new Error("Expected user audit actor");
  }
  return actor.userId;
}
