import type { ConsoleAuditEvent } from "./audit-events.js";
import { formatPrincipalChainActorLabel } from "./actor-chain-label.js";
import type { ConsoleActorChainDetails } from "./actor-chain-label.js";

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

function auditEventToPrincipalChainActor(event: ConsoleAuditEvent) {
  const chainDetails = auditDetailsToActorChainDetails(event.details);
  if (event.actor.actorType === "user") {
    return {
      actorType: "user" as const,
      ...(event.actor.userId === undefined ? {} : { userId: event.actor.userId }),
      ...(chainDetails === undefined ? {} : { details: chainDetails }),
    };
  }
  if (event.actor.actorType === "machine") {
    return {
      actorType: "machine" as const,
      ...(event.actor.machineIdentityId === undefined
        ? {}
        : { machineIdentityId: event.actor.machineIdentityId }),
      ...(chainDetails === undefined ? {} : { details: chainDetails }),
    };
  }
  return { actorType: "ci_exchange" as const };
}

/**
 * Principal-chain actor label for audit rows (docs/web-console-ux.md §Actor Rendering). Metadata
 * only; never includes Sensitive Values.
 */
export function formatConsoleAuditActorLabel(event: ConsoleAuditEvent): string {
  return formatPrincipalChainActorLabel(auditEventToPrincipalChainActor(event));
}

export { auditEventToPrincipalChainActor };
