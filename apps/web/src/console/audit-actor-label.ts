import type { ConsoleAuditEvent } from "./audit-events.js";
import {
  formatMachineActorChainLabel,
  formatUserActorChainLabel,
  type ConsoleActorChainDetails,
} from "./actor-chain-label.js";

function auditDetailsToActorChainDetails(
  details: ConsoleAuditEvent["details"],
): ConsoleActorChainDetails | undefined {
  if (details === null) {
    return undefined;
  }
  return {
    ...(typeof details.agentSessionId === "string"
      ? { agentSessionId: details.agentSessionId }
      : {}),
    ...(typeof details.harnessName === "string" ? { harnessName: details.harnessName } : {}),
    ...(typeof details.agentAttributionTag === "string"
      ? { agentAttributionTag: details.agentAttributionTag }
      : {}),
    ...(typeof details.githubRunId === "string" ? { githubRunId: details.githubRunId } : {}),
  };
}

/**
 * Principal-chain actor label for audit rows (docs/web-console-ux.md §Actor Rendering). Metadata
 * only; never includes Sensitive Values.
 */
export function formatConsoleAuditActorLabel(event: ConsoleAuditEvent): string {
  const { actor, details } = event;
  const chainDetails = auditDetailsToActorChainDetails(details);
  if (actor.actorType === "user") {
    return formatUserActorChainLabel(actor.userId ?? "user", chainDetails);
  }
  if (actor.actorType === "machine") {
    return formatMachineActorChainLabel(actor.machineIdentityId ?? "machine", chainDetails);
  }
  return "ci_exchange";
}
