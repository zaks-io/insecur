import {
  recordActionAudit,
  type AuditActorRef,
  type AuditEventResult,
  type AuditResourceRef,
} from "@insecur/audit";
import type {
  EnvironmentId,
  KnownErrorCode,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { parseOpaqueResourceId } from "@insecur/domain";

import {
  protectedChangeAuditEventCode,
  type ProtectedChangeAuditAction,
} from "./protected-change-audit-codes.js";
import { protectedChangeStateCode, type ProtectedChangeState } from "./protected-change-states.js";

export type { ProtectedChangeAuditAction };

export interface RecordProtectedChangeAuditInput {
  readonly action: ProtectedChangeAuditAction;
  readonly outcome: "success" | "denied";
  readonly actor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly protectedChangeId: RequestId;
  readonly fromState?: ProtectedChangeState;
  readonly toState?: ProtectedChangeState;
  readonly reasonCode?: KnownErrorCode;
}

function protectedChangeResource(protectedChangeId: RequestId): AuditResourceRef {
  const parsed = parseOpaqueResourceId(protectedChangeId, "req");
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return {
    type: "approval_request",
    id: parsed.value,
  };
}

/** Records metadata-only protected change workflow audit events. */
export async function recordProtectedChangeAudit(
  input: RecordProtectedChangeAuditInput,
): Promise<AuditEventResult | undefined> {
  const details =
    input.fromState === undefined && input.toState === undefined
      ? undefined
      : {
          ...(input.fromState === undefined
            ? {}
            : { fromState: protectedChangeStateCode(input.fromState) }),
          ...(input.toState === undefined
            ? {}
            : { toState: protectedChangeStateCode(input.toState) }),
        };

  return recordActionAudit({
    eventCode: protectedChangeAuditEventCode(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: protectedChangeResource(input.protectedChangeId),
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    ...(details === undefined ? {} : { details }),
  });
}
