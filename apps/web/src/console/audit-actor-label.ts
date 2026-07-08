import type { ConsoleAuditEvent } from "./audit-events.js";

function detailString(details: ConsoleAuditEvent["details"], key: string): string | undefined {
  const value = details?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function shortHarnessName(harnessName: string): string {
  return harnessName.replace(/^agent\.harness\./u, "");
}

function formatUserActorChain(userId: string, details: ConsoleAuditEvent["details"]): string {
  const agentSessionId = detailString(details, "agentSessionId");
  if (agentSessionId !== undefined) {
    const harnessName = detailString(details, "harnessName");
    const harness = harnessName === undefined ? "agent" : shortHarnessName(harnessName);
    return `agent ${agentSessionId} (${harness}) · under ${userId}`;
  }
  const agentAttributionTag = detailString(details, "agentAttributionTag");
  if (agentAttributionTag !== undefined) {
    return `${userId} · via ${agentAttributionTag} (unverified)`;
  }
  return userId;
}

function formatMachineActorChain(
  machineIdentityId: string,
  details: ConsoleAuditEvent["details"],
): string {
  const githubRunId = detailString(details, "githubRunId");
  if (githubRunId !== undefined) {
    return `${githubRunId} · ${machineIdentityId}`;
  }
  return machineIdentityId;
}

/**
 * Principal-chain actor label for audit rows (docs/web-console-ux.md §Actor Rendering). Metadata
 * only; never includes Sensitive Values.
 */
export function formatConsoleAuditActorLabel(event: ConsoleAuditEvent): string {
  const { actor, details } = event;
  if (actor.actorType === "user") {
    return formatUserActorChain(actor.userId ?? "user", details);
  }
  if (actor.actorType === "machine") {
    return formatMachineActorChain(actor.machineIdentityId ?? "machine", details);
  }
  return "ci_exchange";
}
