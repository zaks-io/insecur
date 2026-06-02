export const OPERATION_STATES = [
  "pending",
  "waiting_for_human",
  "running",
  "blocked",
  "incomplete",
  "succeeded",
  "completed_with_warnings",
  "canceled",
  "failed",
] as const;

export type OperationState = (typeof OPERATION_STATES)[number];

export const TERMINAL_OPERATION_STATES = new Set<OperationState>([
  "succeeded",
  "completed_with_warnings",
  "canceled",
  "failed",
]);

export const CANCELABLE_OPERATION_STATES = new Set<OperationState>([
  "pending",
  "waiting_for_human",
  "running",
  "blocked",
  "incomplete",
]);

export const RETRYABLE_OPERATION_STATES = new Set<OperationState>(["blocked", "incomplete"]);

const ALLOWED_TRANSITIONS: Readonly<Record<OperationState, readonly OperationState[]>> = {
  pending: ["running", "blocked", "canceled", "waiting_for_human"],
  waiting_for_human: ["running", "blocked", "canceled"],
  running: [
    "waiting_for_human",
    "blocked",
    "incomplete",
    "succeeded",
    "completed_with_warnings",
    "failed",
    "canceled",
  ],
  blocked: ["running", "canceled"],
  incomplete: ["running", "canceled"],
  succeeded: [],
  completed_with_warnings: [],
  canceled: [],
  failed: [],
};

export function isOperationState(value: string): value is OperationState {
  return (OPERATION_STATES as readonly string[]).includes(value);
}

export function isTerminalOperationState(state: OperationState): boolean {
  return TERMINAL_OPERATION_STATES.has(state);
}

export function isTransitionAllowed(
  currentState: OperationState,
  nextState: OperationState,
): boolean {
  if (currentState === nextState) {
    return true;
  }
  return ALLOWED_TRANSITIONS[currentState].includes(nextState);
}
