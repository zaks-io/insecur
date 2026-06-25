/** Durable environment posture tier (not inferred from Display Name). */
export const ENVIRONMENT_LIFECYCLE_STAGES = {
  development: "development",
  preview: "preview",
  staging: "staging",
  production: "production",
} as const;

export type EnvironmentLifecycleStage =
  (typeof ENVIRONMENT_LIFECYCLE_STAGES)[keyof typeof ENVIRONMENT_LIFECYCLE_STAGES];

const ENVIRONMENT_LIFECYCLE_STAGE_SET = new Set<string>(
  Object.values(ENVIRONMENT_LIFECYCLE_STAGES),
);

export function isEnvironmentLifecycleStage(value: string): value is EnvironmentLifecycleStage {
  return ENVIRONMENT_LIFECYCLE_STAGE_SET.has(value);
}
