import type { AuthFailure } from "@insecur/auth";

export class AuthFailureError extends Error {
  readonly failure: AuthFailure;

  constructor(failure: AuthFailure) {
    super(failure.message);
    this.name = "AuthFailureError";
    this.failure = failure;
  }
}
