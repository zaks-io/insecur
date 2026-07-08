import { auditAccessDenialOnFailure } from "@insecur/access";
import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { generateAuditEventId } from "@insecur/audit";
import { requestId, type RequestId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import {
  assertProtectedChangeAccess,
  assertProtectedEnvironmentCoordinate,
  isProtectedChangeAccessDenied,
} from "./assert-protected-change-access.js";
import { isProtectedChangeError } from "./protected-change-errors.js";
import { recordProtectedChangeAudit } from "./record-protected-change-audit.js";
import type {
  CreateProtectedChangeInput,
  ProtectedChangeRecord,
} from "./protected-change-types.js";
import { TenantProtectedChangeStore } from "./tenant-protected-change-store.js";

export interface CreateProtectedChangeRequestInput extends CreateProtectedChangeInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly requestId: RequestId;
  readonly isProtectedEnvironment: boolean;
  readonly deps?: AuthorizeScopeDeps;
}

async function recordCreateAccessDenied(
  input: CreateProtectedChangeRequestInput,
  error: unknown,
): Promise<void> {
  await recordProtectedChangeAudit({
    action: "request_created",
    outcome: "denied",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    protectedChangeId: input.protectedChangeId,
    ...(isProtectedChangeError(error) ? { reasonCode: error.code } : {}),
  });
}

export async function createProtectedChange(
  input: CreateProtectedChangeRequestInput,
): Promise<ProtectedChangeRecord> {
  assertProtectedEnvironmentCoordinate({
    isProtected: input.isProtectedEnvironment,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  try {
    await assertProtectedChangeAccess({
      action: "create",
      actor: input.actor,
      auditActor: input.auditActor,
      coordinate: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      },
      requestId: input.requestId,
      ...(input.deps === undefined ? {} : { deps: input.deps }),
    });
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isProtectedChangeAccessDenied,
      recordDenied: async () => recordCreateAccessDenied(input, error),
    });
    throw error;
  }

  const record = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => new TenantProtectedChangeStore(sql).insertProtectedChange(input),
  );

  await recordProtectedChangeAudit({
    action: "request_created",
    outcome: "success",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    protectedChangeId: record.protectedChangeId,
    toState: record.state,
  });

  return record;
}

export function generateProtectedChangeId(): RequestId {
  return requestId.generate();
}

export function generateApprovalEvidenceId() {
  return generateAuditEventId();
}
