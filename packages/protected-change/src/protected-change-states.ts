export const PROTECTED_CHANGE_STATES = [
  "proposed",
  "pending_approval",
  "approved",
  "rejected",
  "stale",
  "canceled",
  "executing",
  "succeeded",
  "failed",
] as const;

export type ProtectedChangeState = (typeof PROTECTED_CHANGE_STATES)[number];

export const TERMINAL_PROTECTED_CHANGE_STATES = new Set<ProtectedChangeState>([
  "rejected",
  "stale",
  "canceled",
  "succeeded",
  "failed",
]);

export const PROTECTED_CHANGE_ACTIVE_STATES = new Set<ProtectedChangeState>([
  "proposed",
  "pending_approval",
  "approved",
  "executing",
]);

const ALLOWED_TRANSITIONS: Readonly<Record<ProtectedChangeState, readonly ProtectedChangeState[]>> =
  {
    proposed: ["pending_approval", "canceled"],
    pending_approval: ["approved", "rejected", "stale", "canceled"],
    approved: ["executing"],
    executing: ["succeeded", "failed"],
    rejected: [],
    stale: [],
    canceled: [],
    succeeded: [],
    failed: [],
  };

export function isProtectedChangeState(value: string): value is ProtectedChangeState {
  return (PROTECTED_CHANGE_STATES as readonly string[]).includes(value);
}

export function isTerminalProtectedChangeState(state: ProtectedChangeState): boolean {
  return TERMINAL_PROTECTED_CHANGE_STATES.has(state);
}

export function isProtectedChangeTransitionAllowed(
  currentState: ProtectedChangeState,
  nextState: ProtectedChangeState,
): boolean {
  if (currentState === nextState) {
    return true;
  }
  return ALLOWED_TRANSITIONS[currentState].includes(nextState);
}
