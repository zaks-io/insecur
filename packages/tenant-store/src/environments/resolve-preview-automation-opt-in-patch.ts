import type { EnvironmentLifecycleMetadata, UpdateEnvironmentLifecyclePatch } from "./types.js";

export interface ResolvedPreviewAutomationOptInPatch {
  previewAutomationOptInAt: Date | null;
  previewAutomationOptInActorUserId: string | null;
}

export function resolvePreviewAutomationOptInPatch(
  current: EnvironmentLifecycleMetadata,
  patch: UpdateEnvironmentLifecyclePatch,
): ResolvedPreviewAutomationOptInPatch {
  if (patch.previewAutomationOptIn === true) {
    return {
      previewAutomationOptInAt: patch.lifecycleUpdatedAt,
      previewAutomationOptInActorUserId: patch.previewAutomationOptInActorUserId ?? null,
    };
  }
  if (patch.previewAutomationOptIn === false) {
    return {
      previewAutomationOptInAt: null,
      previewAutomationOptInActorUserId: null,
    };
  }
  return {
    previewAutomationOptInAt: current.previewAutomationOptIn?.optedInAt ?? null,
    previewAutomationOptInActorUserId: current.previewAutomationOptIn?.actorUserId ?? null,
  };
}
