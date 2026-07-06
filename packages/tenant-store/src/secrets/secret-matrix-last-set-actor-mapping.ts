import { machineIdentityId, userId } from "@insecur/domain";

import type { SecretMatrixLastSetActorRow } from "./secret-matrix-metadata-types.js";

export function parseMachineLastSetActor(
  actorMachineIdentityId: string | null,
): SecretMatrixLastSetActorRow | null {
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
  };
}

function parseUserLastSetActor(actorUserId: string | null): SecretMatrixLastSetActorRow {
  return {
    actorType: "user",
    userId: actorUserId ? userId.brand(actorUserId) : null,
    machineIdentityId: null,
  };
}

export function parseCiExchangeLastSetActor(): SecretMatrixLastSetActorRow {
  return {
    actorType: "ci_exchange",
    userId: null,
    machineIdentityId: null,
  };
}

export function toLastSetActorFromMachineAuditRow(
  actorMachineIdentityId: string | null,
): SecretMatrixLastSetActorRow | null {
  return parseMachineLastSetActor(actorMachineIdentityId);
}

export function toLastSetActor(row: {
  actorType: string;
  actorUserId: string | null;
  actorMachineIdentityId: string | null;
}): SecretMatrixLastSetActorRow | null {
  if (row.actorType === "machine") {
    return toLastSetActorFromMachineAuditRow(row.actorMachineIdentityId);
  }
  if (row.actorType === "user") {
    return parseUserLastSetActor(row.actorUserId);
  }
  if (row.actorType === "ci_exchange") {
    return parseCiExchangeLastSetActor();
  }
  return null;
}

export function shouldSkipMalformedMachineAuditRow(row: {
  actorType: string;
  actorMachineIdentityId: string | null;
}): boolean {
  return row.actorType === "machine" && !row.actorMachineIdentityId;
}
