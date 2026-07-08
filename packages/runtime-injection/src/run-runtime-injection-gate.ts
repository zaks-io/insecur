import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type { KnownErrorCode, OrganizationId, ProjectId, EnvironmentId } from "@insecur/domain";
import { isStorageGateDeliveryError } from "@insecur/storage-security-gate";

import {
  assertProductionRuntimeInjectionGate,
  assertProductionRuntimeInjectionIssueGate,
  type RuntimeInjectionGateDeps,
} from "./gate-production-runtime-injection.js";
import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";

export interface RuntimeInjectionDeliveryGateCoordinate {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

async function runRuntimeInjectionIssueGate(
  input: RuntimeInjectionGateDeps & {
    actor: ActorRef;
    coordinate: RuntimeInjectionDeliveryGateCoordinate;
  },
): Promise<void> {
  await assertProductionRuntimeInjectionIssueGate({
    actor: input.actor,
    coordinate: input.coordinate,
    ...(input.deliveryPath !== undefined ? { deliveryPath: input.deliveryPath } : {}),
    ...(input.evaluateStorageSecurityGate !== undefined
      ? { evaluateStorageSecurityGate: input.evaluateStorageSecurityGate }
      : {}),
  });
}

export async function runRuntimeInjectionIssueGateWithAudit(
  input: RuntimeInjectionGateDeps & {
    actor: ActorRef;
    coordinate: RuntimeInjectionDeliveryGateCoordinate;
    recordDenied: (reasonCode: KnownErrorCode) => Promise<void>;
  },
): Promise<void> {
  try {
    await runRuntimeInjectionIssueGate(input);
  } catch (error) {
    await recordRuntimeInjectionGateDenial(error, input.recordDenied);
    throw error;
  }
}

async function runRuntimeInjectionConsumeGate(
  input: RuntimeInjectionGateDeps & {
    actor: AuditActorRef;
    coordinate: RuntimeInjectionDeliveryGateCoordinate;
  },
): Promise<void> {
  await assertProductionRuntimeInjectionGate({
    actor: input.actor,
    coordinate: input.coordinate,
    ...(input.deliveryPath !== undefined ? { deliveryPath: input.deliveryPath } : {}),
    ...(input.evaluateStorageSecurityGate !== undefined
      ? { evaluateStorageSecurityGate: input.evaluateStorageSecurityGate }
      : {}),
  });
}

function isRuntimeInjectionGateDenialError(error: unknown): error is { code: KnownErrorCode } {
  return isStorageGateDeliveryError(error) || error instanceof RuntimeInjectionPolicyError;
}

async function recordRuntimeInjectionGateDenial(
  error: unknown,
  recordDenied: (reasonCode: KnownErrorCode) => Promise<void>,
): Promise<void> {
  if (isRuntimeInjectionGateDenialError(error)) {
    await recordDenied(error.code).catch(() => undefined);
  }
}

export async function runRuntimeInjectionConsumeGateWithAudit(
  input: RuntimeInjectionGateDeps & {
    actor: AuditActorRef;
    coordinate: RuntimeInjectionDeliveryGateCoordinate | undefined;
    recordDenied: (reasonCode: KnownErrorCode) => Promise<void>;
  },
): Promise<void> {
  if (input.coordinate === undefined) {
    return;
  }

  try {
    await runRuntimeInjectionConsumeGate({
      actor: input.actor,
      coordinate: input.coordinate,
      ...(input.deliveryPath !== undefined ? { deliveryPath: input.deliveryPath } : {}),
      ...(input.evaluateStorageSecurityGate !== undefined
        ? { evaluateStorageSecurityGate: input.evaluateStorageSecurityGate }
        : {}),
    });
  } catch (error) {
    await recordRuntimeInjectionGateDenial(error, input.recordDenied);
    throw error;
  }
}
