import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  parseRejectApprovalRequestSubmission,
  rejectApprovalRequestForRequest,
  type RejectApprovalRequestOutcome,
  type RejectApprovalRequestSubmission,
} from "../console/reject-approval-request.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

export const rejectOrgApprovalRequest = createServerFn({ method: "POST" })
  .validator((input: unknown): RejectApprovalRequestSubmission => {
    const submission = parseRejectApprovalRequestSubmission(input);
    if (submission === null) {
      throw new Error("malformed reject approval request submission");
    }
    return submission;
  })
  .handler(async ({ data }): Promise<RejectApprovalRequestOutcome> => {
    const request = getRequest();
    return rejectApprovalRequestForRequest(
      {
        cookieHeader: request.headers.get("Cookie"),
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      data,
    );
  });
