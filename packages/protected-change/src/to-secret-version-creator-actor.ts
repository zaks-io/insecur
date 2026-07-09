import type { ActorRef } from "@insecur/access";
import type { SecretVersionCreatorActor } from "@insecur/tenant-store";

/** Maps an authenticated ActorRef to the creator stamped on a new Secret Version (ADR-0017 §27). */
export function toSecretVersionCreatorActor(actor: ActorRef): SecretVersionCreatorActor {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  return { type: "machine", machineIdentityId: actor.machineIdentityId };
}
