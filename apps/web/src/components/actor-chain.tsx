import { formatPrincipalChainActorLabel } from "../console/actor-chain-label.js";
import type { ConsolePrincipalChainActor } from "../console/actor-chain-label.js";
import { formatApprovalActorChainLabel } from "../console/approval-actor-chain.js";

/** Principal-chain actor label for approval evidence (docs/web-console-ux.md §Actor Rendering). */
export function ActorChain({
  actor,
  requestingUserId,
  requestingMachineIdentityId,
  details,
}: {
  readonly actor?: ConsolePrincipalChainActor;
  readonly requestingUserId?: string | null;
  readonly requestingMachineIdentityId?: string | null;
  readonly details?: ConsolePrincipalChainActor["details"];
}) {
  const label =
    actor !== undefined
      ? formatPrincipalChainActorLabel(actor)
      : formatApprovalActorChainLabel({
          requestingUserId: requestingUserId ?? null,
          requestingMachineIdentityId: requestingMachineIdentityId ?? null,
          ...(details === undefined ? {} : { details }),
        });

  return <span className="font-mono text-sm text-foreground">{label}</span>;
}
