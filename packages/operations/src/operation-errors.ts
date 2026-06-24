import { OPERATION_ERROR_CODES, type OperationErrorCode } from "@insecur/domain";

export { OPERATION_ERROR_CODES, type OperationErrorCode };

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
