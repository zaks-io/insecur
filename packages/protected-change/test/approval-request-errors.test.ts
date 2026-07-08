import { APPROVAL_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  approvalRequestNotFound,
  ApprovalRequestError,
  isApprovalRequestError,
} from "../src/approval-request-errors.js";

describe("approval-request-errors", () => {
  it("creates metadata-safe not-found errors", () => {
    const error = approvalRequestNotFound();
    expect(error).toBeInstanceOf(ApprovalRequestError);
    expect(error.code).toBe(APPROVAL_ERROR_CODES.requestNotFound);
    expect(isApprovalRequestError(error)).toBe(true);
    expect(isApprovalRequestError(new Error("other"))).toBe(false);
  });
});
