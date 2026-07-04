import type { AuditActorRef } from "@insecur/audit";
import type { MachineIdentityId } from "@insecur/domain";

export function machineAuthExchangeAuditActor(input: {
  machineIdentityId?: MachineIdentityId;
}): AuditActorRef {
  if (input.machineIdentityId !== undefined) {
    return { type: "machine", machineIdentityId: input.machineIdentityId };
  }
  return { type: "ci_exchange" };
}
