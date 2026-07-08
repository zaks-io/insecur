import { machineIdentityId, userId } from "@insecur/domain";

import type {
  PrincipalChainActorDetailsRow,
  PrincipalChainActorRow,
} from "./principal-chain-actor-types.js";
import { shouldSkipMalformedMachineAuditRow } from "./secret-matrix-last-set-actor-mapping.js";

const PRINCIPAL_CHAIN_DETAIL_KEYS = [
  "agentSessionId",
  "harnessName",
  "agentAttributionTag",
  "githubRunId",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePrincipalChainDetails(value: unknown): PrincipalChainActorDetailsRow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const parsed: Record<string, string> = {};
  for (const key of PRINCIPAL_CHAIN_DETAIL_KEYS) {
    const entry = value[key];
    if (typeof entry === "string" && entry !== "") {
      parsed[key] = entry;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseUserPrincipalChainActor(
  actorUserId: string | null,
  details: PrincipalChainActorDetailsRow | undefined,
): PrincipalChainActorRow {
  const parsedUserId =
    actorUserId === null ? null : userId.parse(actorUserId).ok ? userId.brand(actorUserId) : null;
  return {
    actorType: "user",
    userId: parsedUserId,
    machineIdentityId: null,
    ...(details === undefined ? {} : { details }),
  };
}

function parseMachinePrincipalChainActor(
  actorMachineIdentityId: string | null,
  details: PrincipalChainActorDetailsRow | undefined,
): PrincipalChainActorRow | null {
  if (!actorMachineIdentityId) {
    return null;
  }
  const parsedMachineIdentityId = machineIdentityId.parse(actorMachineIdentityId);
  if (!parsedMachineIdentityId.ok) {
    return null;
  }
  return {
    actorType: "machine",
    userId: null,
    machineIdentityId: parsedMachineIdentityId.value,
    ...(details === undefined ? {} : { details }),
  };
}

function parseCiExchangePrincipalChainActor(): PrincipalChainActorRow {
  return { actorType: "ci_exchange", userId: null, machineIdentityId: null };
}

/** Maps one audit row to a metadata-only principal-chain actor for console rendering. */
export function principalChainActorFromAuditRow(row: {
  readonly actorType: string;
  readonly actorUserId: string | null;
  readonly actorMachineIdentityId: string | null;
  readonly details: unknown;
}): PrincipalChainActorRow | null {
  if (shouldSkipMalformedMachineAuditRow(row)) {
    return null;
  }
  const details = parsePrincipalChainDetails(row.details);
  if (row.actorType === "machine") {
    return parseMachinePrincipalChainActor(row.actorMachineIdentityId, details);
  }
  if (row.actorType === "user") {
    return parseUserPrincipalChainActor(row.actorUserId, details);
  }
  if (row.actorType === "ci_exchange") {
    return parseCiExchangePrincipalChainActor();
  }
  return null;
}
