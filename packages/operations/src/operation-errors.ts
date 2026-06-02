export const OPERATION_ERROR_CODES = {
  notFound: "operation.not_found",
  invalidIntent: "operation.invalid_intent",
  invalidMetadata: "operation.invalid_metadata",
  staleTransition: "operation.stale_transition",
  invalidTransition: "operation.invalid_transition",
  terminalState: "operation.terminal_state",
  notCancelable: "operation.not_cancelable",
  notRetryable: "operation.not_retryable",
  targetBusy: "sync.target_busy",
  staleFencingToken: "operation.stale_fencing_token",
  leaseNotHeld: "operation.lease_not_held",
  leaseRequired: "operation.lease_required",
} as const;

export type OperationErrorCode = (typeof OPERATION_ERROR_CODES)[keyof typeof OPERATION_ERROR_CODES];

export class OperationStoreError extends Error {
  readonly code: OperationErrorCode;
  readonly retryable: boolean;

  constructor(code: OperationErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "OperationStoreError";
    this.code = code;
    this.retryable = retryable;
  }
}
