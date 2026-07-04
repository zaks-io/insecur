import { auditAccessDenialOnFailure } from "@insecur/access";
import type {
  AuditActorRef,
  AuditOperationRef,
  AuditRequestRef,
  AuditUserActorRef,
} from "@insecur/audit";
import { recordRuntimeInjectionAudit } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { InjectionGrantConsumeFailure } from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";

export function reasonCodeForConsumeFailure(
  reason: InjectionGrantConsumeFailure,
): (typeof INJECTION_ERROR_CODES)[keyof typeof INJECTION_ERROR_CODES] {
  if (reason === "expired") {
    return INJECTION_ERROR_CODES.grantExpired;
  }
  return INJECTION_ERROR_CODES.grantDenied;
}

export function assertUserActorForConsume(
  actor: AuditActorRef,
): asserts actor is AuditUserActorRef {
  if (actor.type !== "user") {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection scope required",
    );
  }
}

export async function recordConsumeDeniedAudit(input: {
  actor: AuditActorRef;
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  reasonCode: InjectionGrantError["code"];
  coordinate?: { projectId: ProjectId; environmentId: EnvironmentId };
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}): Promise<void> {
  await recordRuntimeInjectionAudit({
    phase: "consume",
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    grantId: input.grantId,
    reasonCode: input.reasonCode,
    ...(input.coordinate !== undefined
      ? { projectId: input.coordinate.projectId, environmentId: input.coordinate.environmentId }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

async function rethrowAfterConsumeAuditDenial(
  error: unknown,
  input: {
    recordDenied: (reasonCode: InjectionGrantError["code"]) => Promise<void>;
  },
): Promise<never> {
  if (error instanceof InjectionGrantError) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: (candidate): candidate is InjectionGrantError =>
        candidate instanceof InjectionGrantError &&
        candidate.code === AUTH_ERROR_CODES.insufficientScope,
      recordDenied: () => input.recordDenied(AUTH_ERROR_CODES.insufficientScope),
    });
    if (error.code !== AUTH_ERROR_CODES.insufficientScope) {
      await input.recordDenied(error.code).catch(() => undefined);
    }
  }
  throw error;
}

export async function runConsumeWithAuditDenialHandling<T>(input: {
  run: () => Promise<T>;
  recordDenied: (reasonCode: InjectionGrantError["code"]) => Promise<void>;
}): Promise<T> {
  try {
    return await input.run();
  } catch (error) {
    return await rethrowAfterConsumeAuditDenial(error, {
      recordDenied: input.recordDenied,
    });
  }
}
