import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import {
  createMissingEvidenceProbes,
  evaluateStorageSecurityGate,
  PRODUCTION_DELIVERY_PATHS,
  requiresProductionStorageSecurityGate,
  runWithProductionDeliveryGate,
  type StorageGateDeliveryPath,
  type StorageSecurityGateScope,
  type StorageSecurityGateVerdict,
  isStorageGateDeliveryError,
} from "@insecur/storage-security-gate";

import { assertProtectedPolicyUseAllowed } from "./assert-protected-policy-use.js";
import { loadRuntimeInjectionEnvironmentContext } from "./load-runtime-injection-environment-context.js";
import {
  resolveRuntimeInjectionDeliveryPath,
  type RuntimeInjectionEnvironmentPosture,
} from "./resolve-runtime-injection-delivery-path.js";

export interface RuntimeInjectionGateCoordinate {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

export interface RuntimeInjectionGateActorContext {
  readonly actor: ActorRef | AuditActorRef;
  readonly coordinate: RuntimeInjectionGateCoordinate;
}

export interface RuntimeInjectionGateDeps {
  readonly deliveryPath?: StorageGateDeliveryPath;
  readonly evaluateStorageSecurityGate?: (
    scope: StorageSecurityGateScope,
  ) => Promise<StorageSecurityGateVerdict>;
}

export interface RuntimeInjectionGateContext {
  readonly deliveryPath: StorageGateDeliveryPath;
  readonly environment: RuntimeInjectionEnvironmentPosture;
  readonly gateVerdict: StorageSecurityGateVerdict | undefined;
}

function toGateScope(coordinate: RuntimeInjectionGateCoordinate): StorageSecurityGateScope {
  return {
    organizationId: coordinate.organizationId,
    projectId: coordinate.projectId,
    environmentId: coordinate.environmentId,
  };
}

/** Fail-closed default until INS-54 composes live readiness probes on delivery callers. */
export function createRuntimeInjectionStorageGateEvaluator(
  deps: RuntimeInjectionGateDeps = {},
): (scope: StorageSecurityGateScope) => Promise<StorageSecurityGateVerdict> {
  if (deps.evaluateStorageSecurityGate !== undefined) {
    return deps.evaluateStorageSecurityGate;
  }

  return async (scope) =>
    evaluateStorageSecurityGate({
      scope,
      probes: createMissingEvidenceProbes(),
    });
}

export async function resolveRuntimeInjectionGateContext(
  input: RuntimeInjectionGateActorContext & RuntimeInjectionGateDeps,
): Promise<RuntimeInjectionGateContext> {
  if (
    input.deliveryPath !== undefined &&
    !requiresProductionStorageSecurityGate(input.deliveryPath)
  ) {
    return {
      deliveryPath: input.deliveryPath,
      environment: {
        isProtected: false,
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
      },
      gateVerdict: undefined,
    };
  }

  const environment = await loadRuntimeInjectionEnvironmentContext(input.coordinate);
  const deliveryPath = resolveRuntimeInjectionDeliveryPath(environment, input.deliveryPath);
  if (!requiresProductionStorageSecurityGate(deliveryPath)) {
    return { deliveryPath, environment, gateVerdict: undefined };
  }

  const evaluateGate = createRuntimeInjectionStorageGateEvaluator(input);
  const gateVerdict = await runWithProductionDeliveryGate({
    path: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
    evaluateGate: () => evaluateGate(toGateScope(input.coordinate)),
    delivery: (verdict) => Promise.resolve(verdict),
  });

  return { deliveryPath, environment, gateVerdict };
}

export async function assertProductionRuntimeInjectionGate(
  input: RuntimeInjectionGateActorContext & RuntimeInjectionGateDeps,
): Promise<RuntimeInjectionGateContext> {
  return resolveRuntimeInjectionGateContext(input);
}

export async function assertProductionRuntimeInjectionIssueGate(
  input: RuntimeInjectionGateActorContext & RuntimeInjectionGateDeps & { actor: ActorRef },
): Promise<RuntimeInjectionGateContext> {
  const context = await resolveRuntimeInjectionGateContext(input);

  if (context.environment.isProtected) {
    await assertProtectedPolicyUseAllowed({
      actor: input.actor,
      coordinate: input.coordinate,
      isProtected: true,
      storageSecurityGatePassed: context.gateVerdict?.status === "passed",
    });
  }

  return context;
}

export { isStorageGateDeliveryError };
