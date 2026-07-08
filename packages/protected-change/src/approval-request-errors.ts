import { APPROVAL_ERROR_CODES, AUTH_ERROR_CODES } from "@insecur/domain";

export class ApprovalRequestError extends Error {
  readonly code:
    | (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES]
    | typeof AUTH_ERROR_CODES.insufficientScope;

  constructor(
    code:
      | (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES]
      | typeof AUTH_ERROR_CODES.insufficientScope,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalRequestError";
    this.code = code;
  }
}

export function isApprovalRequestError(error: unknown): error is ApprovalRequestError {
  return error instanceof ApprovalRequestError;
}

export function approvalRequestNotFound(): ApprovalRequestError {
  return new ApprovalRequestError(
    APPROVAL_ERROR_CODES.requestNotFound,
    "approval request not found",
  );
}
