import { isStableDottedCode, type KnownErrorCode } from "@insecur/domain";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";

export function assertKnownErrorCode(
  value: string,
  field: string,
): asserts value is KnownErrorCode {
  if (!isStableDottedCode(value)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be a stable dotted code`,
    );
  }
}

export function assertIsoTimestamp(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be an ISO-8601 timestamp`,
    );
  }
}
