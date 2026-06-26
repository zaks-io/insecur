import type { AuthFailure } from "@insecur/auth";
import type { RequestId } from "@insecur/domain";

export class AuthFailureError extends Error {
  readonly failure: AuthFailure;
  readonly requestId: RequestId;

  constructor(failure: AuthFailure, requestId: RequestId) {
    super(failure.message);
    this.name = "AuthFailureError";
    this.failure = failure;
    this.requestId = requestId;
  }
}
