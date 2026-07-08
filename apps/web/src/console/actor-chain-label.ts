export interface ConsoleActorChainDetails {
  readonly agentSessionId?: string;
  readonly harnessName?: string;
  readonly agentAttributionTag?: string;
  readonly githubRunId?: string;
}

export interface ConsolePrincipalChainActor {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: string;
  readonly machineIdentityId?: string;
  readonly details?: ConsoleActorChainDetails;
}

function detailString(
  details: ConsoleActorChainDetails | undefined,
  key: keyof ConsoleActorChainDetails,
): string | undefined {
  const value = details?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function shortHarnessName(harnessName: string): string {
  return harnessName.replace(/^agent\.harness\./u, "");
}

export function formatUserActorChainLabel(
  userId: string,
  details: ConsoleActorChainDetails | undefined,
): string {
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

function formatMachineActorChainLabel(
  machineIdentityId: string,
  details: ConsoleActorChainDetails | undefined,
): string {
  const githubRunId = detailString(details, "githubRunId");
  if (githubRunId !== undefined) {
    return `${githubRunId} · ${machineIdentityId}`;
  }
  return machineIdentityId;
}

/** Principal-chain actor label for console surfaces (docs/web-console-ux.md §Actor Rendering). */
export function formatPrincipalChainActorLabel(actor: ConsolePrincipalChainActor): string {
  if (actor.actorType === "ci_exchange") {
    return "ci_exchange";
  }
  if (actor.actorType === "machine") {
    return formatMachineActorChainLabel(actor.machineIdentityId ?? "machine", actor.details);
  }
  return formatUserActorChainLabel(actor.userId ?? "user", actor.details);
}
