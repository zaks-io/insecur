import type { KnownErrorCode } from "@insecur/domain";
import { OperationStoreError } from "@insecur/operations";
import { HIGH_ASSURANCE_ERROR_CODES } from "./high-assurance-challenge-error.js";

export function mapOperationStoreErrorToDenialReason(error: unknown): KnownErrorCode {
  if (error instanceof OperationStoreError) {
    return error.code;
  }

  return HIGH_ASSURANCE_ERROR_CODES.operationMismatch;
}
