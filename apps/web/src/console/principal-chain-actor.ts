import type { ConsoleActorChainDetails, ConsolePrincipalChainActor } from "./actor-chain-label.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseActorChainDetails(value: unknown): ConsoleActorChainDetails | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    ...(typeof value.agentSessionId === "string" ? { agentSessionId: value.agentSessionId } : {}),
    ...(typeof value.harnessName === "string" ? { harnessName: value.harnessName } : {}),
    ...(typeof value.agentAttributionTag === "string"
      ? { agentAttributionTag: value.agentAttributionTag }
      : {}),
    ...(typeof value.githubRunId === "string" ? { githubRunId: value.githubRunId } : {}),
  };
}

function parseUserPrincipalChainActor(
  entry: Record<string, unknown>,
): ConsolePrincipalChainActor | null {
  if (entry.userId !== undefined && typeof entry.userId !== "string") {
    return null;
  }
  const details = parseActorChainDetails(entry.details);
  return {
    actorType: "user",
    ...(typeof entry.userId === "string" ? { userId: entry.userId } : {}),
    ...(details === undefined || Object.keys(details).length === 0 ? {} : { details }),
  };
}

function parseMachinePrincipalChainActor(
  entry: Record<string, unknown>,
): ConsolePrincipalChainActor | null {
  if (typeof entry.machineIdentityId !== "string") {
    return null;
  }
  const details = parseActorChainDetails(entry.details);
  return {
    actorType: "machine",
    machineIdentityId: entry.machineIdentityId,
    ...(details === undefined || Object.keys(details).length === 0 ? {} : { details }),
  };
}

/** Parses a metadata-only principal-chain actor from API/RPC payloads. */
export function parsePrincipalChainActor(entry: unknown): ConsolePrincipalChainActor | null {
  if (!isRecord(entry) || typeof entry.actorType !== "string") {
    return null;
  }
  switch (entry.actorType) {
    case "user":
      return parseUserPrincipalChainActor(entry);
    case "machine":
      return parseMachinePrincipalChainActor(entry);
    case "ci_exchange":
      return { actorType: "ci_exchange" };
    default:
      return null;
  }
}
