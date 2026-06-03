import type { AuditActorRef } from "@insecur/audit";
import type { RequestId } from "@insecur/domain";

export interface EnvironmentLifecycleActorInput {
  actor: AuditActorRef;
  request?: { requestId: RequestId };
}
