import {
  ENVIRONMENT_ERROR_CODES,
  brandValue,
  environmentId,
  isEnvironmentLifecycleState,
  isEnvironmentPostureTier,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";

import type { EnvironmentLifecycleMetadata, EnvironmentLifecycleRow } from "./types.js";

export class EnvironmentLifecycleStoreError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EnvironmentLifecycleStoreError";
    this.code = code;
  }
}

export function mapEnvironmentLifecycleRow(
  row: EnvironmentLifecycleRow,
): EnvironmentLifecycleMetadata {
  if (!isEnvironmentPostureTier(row.posture_tier)) {
    throw new EnvironmentLifecycleStoreError(
      ENVIRONMENT_ERROR_CODES.invalidPosture,
      "environment has invalid posture tier",
    );
  }
  if (!isEnvironmentLifecycleState(row.lifecycle_state)) {
    throw new EnvironmentLifecycleStoreError(
      ENVIRONMENT_ERROR_CODES.invalidLifecycleTransition,
      "environment has invalid lifecycle state",
    );
  }

  const postureTier = row.posture_tier;
  const lifecycleState = row.lifecycle_state;

  const previewNonProtectedOptDown =
    row.preview_non_protected_opt_down_at !== null &&
    row.preview_non_protected_opt_down_actor_user_id !== null
      ? {
          optedDownAt: row.preview_non_protected_opt_down_at,
          actorUserId: userId.brand(row.preview_non_protected_opt_down_actor_user_id),
        }
      : undefined;

  const previewAutomationOptIn =
    row.preview_automation_opt_in_at !== null &&
    row.preview_automation_opt_in_actor_user_id !== null
      ? {
          optedInAt: row.preview_automation_opt_in_at,
          actorUserId: userId.brand(row.preview_automation_opt_in_actor_user_id),
        }
      : undefined;

  return {
    environmentId: environmentId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    projectId: projectId.brand(row.project_id),
    displayName: brandValue<string, "DisplayName">(row.display_name),
    isProtected: row.is_protected,
    postureTier,
    lifecycleState,
    previewNonProtectedOptDown,
    previewAutomationOptIn,
    lifecycleUpdatedAt: row.lifecycle_updated_at,
    createdAt: row.created_at,
  };
}
