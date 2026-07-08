import { ENVIRONMENT_LIFECYCLE_STAGES, type EnvironmentLifecycleStage } from "@insecur/domain";
import {
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  PRODUCTION_DELIVERY_PATHS,
  type StorageGateDeliveryPath,
} from "@insecur/storage-security-gate";

export interface RuntimeInjectionEnvironmentPosture {
  readonly isProtected: boolean;
  readonly lifecycleStage: EnvironmentLifecycleStage;
}

/**
 * First Value non-protected development uses the local carve-out; every other
 * Runtime Injection delivery surface runs the production Storage Security Gate.
 */
export function resolveRuntimeInjectionDeliveryPath(
  posture: RuntimeInjectionEnvironmentPosture,
  explicitPath?: StorageGateDeliveryPath,
): StorageGateDeliveryPath {
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  if (posture.lifecycleStage === ENVIRONMENT_LIFECYCLE_STAGES.development && !posture.isProtected) {
    return FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH;
  }

  return PRODUCTION_DELIVERY_PATHS.runtimeInjection;
}
