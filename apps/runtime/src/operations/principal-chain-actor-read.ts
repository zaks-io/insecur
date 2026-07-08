import type { SecretMatrixLastSetActorRow } from "@insecur/tenant-store";
import type { PrincipalChainActorRead } from "@insecur/worker-kit";

export function toPrincipalChainActorRead(
  actor: SecretMatrixLastSetActorRow,
): PrincipalChainActorRead | undefined {
  switch (actor.actorType) {
    case "machine":
      if (!actor.machineIdentityId) {
        return undefined;
      }
      return {
        actorType: "machine",
        machineIdentityId: actor.machineIdentityId,
        ...(actor.details === undefined ? {} : { details: actor.details }),
      };
    case "user":
      return {
        actorType: "user",
        ...(actor.userId !== null ? { userId: actor.userId } : {}),
        ...(actor.details === undefined ? {} : { details: actor.details }),
      };
    case "ci_exchange":
      return { actorType: "ci_exchange" };
  }
}
