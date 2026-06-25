import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  type EnvironmentLifecycleStage,
} from "@insecur/domain";

import { EnvironmentLifecycleStoreError } from "./errors.js";
import type { PreviewNonProductionOptDown } from "./types.js";

export interface ResolvedEnvironmentProtection {
  isProtected: boolean;
  previewNonProductionOptDown: PreviewNonProductionOptDown | null;
}

/**
 * Derives durable protected posture from lifecycle stage and metadata-safe preview opt-down evidence.
 * Protected status is never inferred from Display Name.
 */
export function resolveEnvironmentProtection(
  lifecycleStage: EnvironmentLifecycleStage,
  previewNonProductionOptDown?: PreviewNonProductionOptDown,
): ResolvedEnvironmentProtection {
  switch (lifecycleStage) {
    case ENVIRONMENT_LIFECYCLE_STAGES.development:
      if (previewNonProductionOptDown !== undefined) {
        throw new EnvironmentLifecycleStoreError(
          ENVIRONMENT_ERROR_CODES.previewOptDownInvalid,
          "preview opt-down evidence applies only to preview environments",
        );
      }
      return { isProtected: false, previewNonProductionOptDown: null };

    case ENVIRONMENT_LIFECYCLE_STAGES.staging:
    case ENVIRONMENT_LIFECYCLE_STAGES.production:
      if (previewNonProductionOptDown !== undefined) {
        throw new EnvironmentLifecycleStoreError(
          ENVIRONMENT_ERROR_CODES.previewOptDownInvalid,
          "preview opt-down evidence applies only to preview environments",
        );
      }
      return { isProtected: true, previewNonProductionOptDown: null };

    case ENVIRONMENT_LIFECYCLE_STAGES.preview:
      if (previewNonProductionOptDown === undefined) {
        return { isProtected: true, previewNonProductionOptDown: null };
      }
      return {
        isProtected: false,
        previewNonProductionOptDown,
      };

    default: {
      const exhaustive: never = lifecycleStage;
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.invalidLifecycleStage,
        `unsupported lifecycle stage: ${String(exhaustive)}`,
      );
    }
  }
}
