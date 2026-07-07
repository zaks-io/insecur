import { AUTH_ERROR_CODES, type OperationId } from "@insecur/domain";

/** Returned when a protected change requires human step-up; carries the bounded operation ID. */
export class HighAssuranceHandoffError extends Error {
  readonly code = AUTH_ERROR_CODES.highAssuranceRequired;
  readonly retryable = false;
  readonly operationId: OperationId;

  constructor(operationId: OperationId, message = "high-assurance challenge required") {
    super(message);
    this.name = "HighAssuranceHandoffError";
    this.operationId = operationId;
  }
}
