/** Regime-ignorant Secret Version lifecycle states for the version store (ADR-0025). */
export const SECRET_VERSION_LIFECYCLE_STATES = {
  draft: "draft",
  live: "live",
  retained: "retained",
  discarded: "discarded",
} as const;

export type SecretVersionLifecycleState =
  (typeof SECRET_VERSION_LIFECYCLE_STATES)[keyof typeof SECRET_VERSION_LIFECYCLE_STATES];

const SECRET_VERSION_LIFECYCLE_STATE_SET = new Set<string>(
  Object.values(SECRET_VERSION_LIFECYCLE_STATES),
);

function isSecretVersionLifecycleState(value: string): value is SecretVersionLifecycleState {
  return SECRET_VERSION_LIFECYCLE_STATE_SET.has(value);
}

function parseSecretVersionLifecycleState(value: string): SecretVersionLifecycleState {
  if (!isSecretVersionLifecycleState(value)) {
    throw new Error(`unsupported secret version lifecycle state: ${value}`);
  }
  return value;
}

export { parseSecretVersionLifecycleState };
