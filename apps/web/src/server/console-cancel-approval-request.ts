import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  cancelApprovalRequestForRequest,
  parseCancelApprovalRequestSubmission,
  type CancelApprovalRequestOutcome,
  type CancelApprovalRequestSubmission,
} from "../console/cancel-approval-request.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

export const cancelOrgApprovalRequest = createServerFn({ method: "POST" })
  .validator((input: unknown): CancelApprovalRequestSubmission => {
    const submission = parseCancelApprovalRequestSubmission(input);
    if (submission === null) {
      throw new Error("malformed cancel approval request submission");
    }
    return submission;
  })
  .handler(async ({ data }): Promise<CancelApprovalRequestOutcome> => {
    const request = getRequest();
    return cancelApprovalRequestForRequest(
      {
        cookieHeader: request.headers.get("Cookie"),
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      data,
    );
  });
