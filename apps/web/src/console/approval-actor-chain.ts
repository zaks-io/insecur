import type { ConsoleActorChainDetails } from "./actor-chain-label.js";
import { formatPrincipalChainActorLabel } from "./actor-chain-label.js";

export type { ConsoleActorChainDetails };

export function formatApprovalActorChainLabel(input: {
  readonly requestingUserId: string | null;
  readonly requestingMachineIdentityId: string | null;
  readonly details?: ConsoleActorChainDetails;
}): string {
  if (input.requestingMachineIdentityId !== null) {
    return formatPrincipalChainActorLabel({
      actorType: "machine",
      machineIdentityId: input.requestingMachineIdentityId,
      ...(input.details === undefined ? {} : { details: input.details }),
    });
  }
  if (input.requestingUserId !== null) {
    return formatPrincipalChainActorLabel({
      actorType: "user",
      userId: input.requestingUserId,
      ...(input.details === undefined ? {} : { details: input.details }),
    });
  }
  return "ci_exchange";
}
