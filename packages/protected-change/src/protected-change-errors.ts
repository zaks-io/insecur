import { PROTECTED_CHANGE_ERROR_CODES } from "@insecur/domain";

export class ProtectedChangeError extends Error {
  readonly code: (typeof PROTECTED_CHANGE_ERROR_CODES)[keyof typeof PROTECTED_CHANGE_ERROR_CODES];

  constructor(
    code: (typeof PROTECTED_CHANGE_ERROR_CODES)[keyof typeof PROTECTED_CHANGE_ERROR_CODES],
    message: string,
  ) {
    super(message);
    this.name = "ProtectedChangeError";
    this.code = code;
  }
}

export function isProtectedChangeError(error: unknown): error is ProtectedChangeError {
  return error instanceof ProtectedChangeError;
}
