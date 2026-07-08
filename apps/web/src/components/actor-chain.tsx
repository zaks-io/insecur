import { formatApprovalActorChainLabel } from "../console/approval-actor-chain.js";
import type { ConsoleActorChainDetails } from "../console/actor-chain-label.js";

/** Principal-chain actor label for approval evidence (docs/web-console-ux.md §Actor Rendering). */
export function ActorChain({
  requestingUserId,
  requestingMachineIdentityId,
  details,
}: {
  readonly requestingUserId: string | null;
  readonly requestingMachineIdentityId: string | null;
  readonly details?: ConsoleActorChainDetails | undefined;
}) {
  return (
    <span className="font-mono text-sm text-foreground">
      {formatApprovalActorChainLabel({
        requestingUserId,
        requestingMachineIdentityId,
        ...(details === undefined ? {} : { details }),
      })}
    </span>
  );
}
