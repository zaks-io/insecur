import type { ActorRef } from "@insecur/access";

export function requesterIdsFromActor(actor: ActorRef): {
  readonly requesterUserId?: (typeof actor & { type: "user" })["userId"];
  readonly requesterMachineIdentityId?: (typeof actor & { type: "machine" })["machineIdentityId"];
} {
  if (actor.type === "user") {
    return { requesterUserId: actor.userId };
  }
  return { requesterMachineIdentityId: actor.machineIdentityId };
}
