/**
 * Environment posture tiers and lifecycle states for Protected Environment policy.
 * @see docs/adr/0038-protected-delivery-requires-machine-credential.md
 */

import type { UserId } from "./resource-ids.js";

export const ENVIRONMENT_POSTURE_TIERS = {
  development: "development",
  preview: "preview",
  staging: "staging",
  production: "production",
} as const;

export type EnvironmentPostureTier =
  (typeof ENVIRONMENT_POSTURE_TIERS)[keyof typeof ENVIRONMENT_POSTURE_TIERS];

const ENVIRONMENT_POSTURE_TIER_SET = new Set<string>(Object.values(ENVIRONMENT_POSTURE_TIERS));

export function isEnvironmentPostureTier(value: string): value is EnvironmentPostureTier {
  return ENVIRONMENT_POSTURE_TIER_SET.has(value);
}

export const ENVIRONMENT_LIFECYCLE_STATES = {
  active: "active",
  archived: "archived",
} as const;

export type EnvironmentLifecycleState =
  (typeof ENVIRONMENT_LIFECYCLE_STATES)[keyof typeof ENVIRONMENT_LIFECYCLE_STATES];

const ENVIRONMENT_LIFECYCLE_STATE_SET = new Set<string>(
  Object.values(ENVIRONMENT_LIFECYCLE_STATES),
);

export function isEnvironmentLifecycleState(value: string): value is EnvironmentLifecycleState {
  return ENVIRONMENT_LIFECYCLE_STATE_SET.has(value);
}

export interface PreviewNonProtectedOptDownEvidence {
  optedDownAt: Date;
  actorUserId: UserId;
}

/**
 * Resolves durable `is_protected` from posture tier and optional preview opt-down evidence.
 * Preview defaults to protected unless explicit opt-down metadata is supplied at creation.
 */
export function resolveIsProtectedFromPosture(
  postureTier: EnvironmentPostureTier,
  previewOptDown?: PreviewNonProtectedOptDownEvidence,
): boolean {
  switch (postureTier) {
    case ENVIRONMENT_POSTURE_TIERS.development:
      return false;
    case ENVIRONMENT_POSTURE_TIERS.staging:
    case ENVIRONMENT_POSTURE_TIERS.production:
      return true;
    case ENVIRONMENT_POSTURE_TIERS.preview:
      return previewOptDown === undefined;
    default: {
      const _exhaustive: never = postureTier;
      return _exhaustive;
    }
  }
}

/** Whether preview automation opt-in is allowed for this posture and protection state. */
export function canSetPreviewAutomationOptIn(
  postureTier: EnvironmentPostureTier,
  isProtected: boolean,
): boolean {
  return postureTier === ENVIRONMENT_POSTURE_TIERS.preview && !isProtected;
}
