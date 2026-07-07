type AuditEventDetails = Readonly<Record<string, string | number | boolean | null>> | null;

interface AuditActorRead {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: string;
  readonly machineIdentityId?: string;
}

export interface AuditActorRenderEvent {
  readonly actor: AuditActorRead;
  readonly details: AuditEventDetails;
}

function shortHarnessName(harnessName: string): string {
  return harnessName.replace(/^agent\.harness\./u, "");
}

function readDetailString(details: AuditEventDetails, key: string): string | undefined {
  if (details === null) {
    return undefined;
  }
  const value = details[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function formatUserActorChain(userId: string, details: AuditEventDetails): string {
  const agentSessionId = readDetailString(details, "agentSessionId");
  if (agentSessionId !== undefined) {
    const harnessName = readDetailString(details, "harnessName");
    const harness = harnessName === undefined ? "agent" : shortHarnessName(harnessName);
    return `agent ${agentSessionId} (${harness}) · under ${userId}`;
  }
  const agentAttributionTag = readDetailString(details, "agentAttributionTag");
  if (agentAttributionTag !== undefined) {
    return `${userId} · via ${agentAttributionTag} (unverified)`;
  }
  return userId;
}

function formatMachineActorChain(machineIdentityId: string, details: AuditEventDetails): string {
  const githubRunId = readDetailString(details, "githubRunId");
  if (githubRunId !== undefined) {
    return `${githubRunId} · ${machineIdentityId}`;
  }
  return machineIdentityId;
}

/**
 * Principal-chain actor label for audit rows (docs/web-console-ux.md §Actor Rendering). Metadata
 * only; never includes Sensitive Values.
 */
export function formatAuditActorPrincipalChain(event: AuditActorRenderEvent): string {
  const { actor, details } = event;
  if (actor.actorType === "user") {
    return formatUserActorChain(actor.userId ?? "user", details);
  }
  if (actor.actorType === "machine") {
    return formatMachineActorChain(actor.machineIdentityId ?? "machine", details);
  }
  return "ci_exchange";
}
