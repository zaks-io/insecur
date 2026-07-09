import type { ActorRef } from "@insecur/access";
import { machineIdentityId, runtimePolicyId, userId } from "@insecur/domain";
import type { InjectionGrantRow } from "@insecur/tenant-store";

export type InjectionGrantOwner =
  | { type: "user"; userId: ReturnType<typeof userId.brand> }
  | {
      type: "machine";
      machineIdentityId: ReturnType<typeof machineIdentityId.brand>;
      runtimePolicyKeyId?: ReturnType<typeof runtimePolicyId.brand>;
    };

export function issuedToFromGrant(grant: InjectionGrantRow): InjectionGrantOwner | undefined {
  if (grant.issued_actor_type === "user" && grant.issued_user_id !== null) {
    return { type: "user", userId: userId.brand(grant.issued_user_id) };
  }
  if (grant.issued_actor_type !== "machine" || grant.issued_machine_identity_id === null) {
    return undefined;
  }
  return {
    type: "machine",
    machineIdentityId: machineIdentityId.brand(grant.issued_machine_identity_id),
    ...(grant.issued_runtime_policy_key_id !== null
      ? { runtimePolicyKeyId: runtimePolicyId.brand(grant.issued_runtime_policy_key_id) }
      : {}),
  };
}

export function actorMatchesGrantOwner(actor: ActorRef, owner: InjectionGrantOwner): boolean {
  if (actor.type === "user") {
    return owner.type === "user" && actor.userId === owner.userId;
  }
  if (owner.type !== "machine" || actor.machineIdentityId !== owner.machineIdentityId) {
    return false;
  }
  const actorPolicy = actor.tokenScope.runtimePolicyKeyId;
  return (
    actorPolicy === undefined ||
    owner.runtimePolicyKeyId === undefined ||
    actorPolicy === owner.runtimePolicyKeyId
  );
}
