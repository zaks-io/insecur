import type { DeliveryPolicyErrorCode } from "@insecur/domain";

/** Fail-closed Delivery Risk Policy failure with a stable, metadata-only dotted code. */
export class DeliveryPolicyError extends Error {
  readonly code: DeliveryPolicyErrorCode;

  constructor(code: DeliveryPolicyErrorCode, message: string) {
    super(message);
    this.name = "DeliveryPolicyError";
    this.code = code;
  }
}

export function isDeliveryPolicyError(error: unknown): error is DeliveryPolicyError {
  return error instanceof DeliveryPolicyError;
}
