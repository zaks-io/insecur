import type { ConsoleActorChainDetails } from "./actor-chain-label.js";
import { formatMachineActorChainLabel, formatUserActorChainLabel } from "./actor-chain-label.js";

export type { ConsoleActorChainDetails };

/**
 * Principal-chain actor label for approval evidence (docs/web-console-ux.md §Actor Rendering).
 * Metadata only; never includes Sensitive Values.
 */
export function formatApprovalActorChainLabel(input: {
  readonly requestingUserId: string | null;
  readonly requestingMachineIdentityId: string | null;
  readonly details?: ConsoleActorChainDetails;
}): string {
  if (input.requestingMachineIdentityId !== null) {
    return formatMachineActorChainLabel(input.requestingMachineIdentityId, input.details);
  }
  if (input.requestingUserId !== null) {
    return formatUserActorChainLabel(input.requestingUserId, input.details);
  }
  return "unknown requester";
}
