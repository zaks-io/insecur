export interface ConsoleActorChainDetails {
  readonly agentSessionId?: string;
  readonly harnessName?: string;
  readonly agentAttributionTag?: string;
  readonly githubRunId?: string;
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

export function formatMachineActorChainLabel(
  machineIdentityId: string,
  details: ConsoleActorChainDetails | undefined,
): string {
  const githubRunId = detailString(details, "githubRunId");
  if (githubRunId !== undefined) {
    return `${githubRunId} · ${machineIdentityId}`;
  }
  return machineIdentityId;
}
