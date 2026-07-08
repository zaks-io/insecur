import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  parseRejectChallengeSubmission,
  rejectHighAssuranceChallengeForRequest,
  type RejectChallengeOutcome,
  type RejectChallengeSubmission,
} from "../console/reject-high-assurance-challenge.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

/**
 * Reject one pending High-Assurance Challenge (INS-381). CSRF-protected server-fn mutation over the
 * BFF scoped-token hop; the deny endpoint audits the decision.
 */
export const rejectOrgHighAssuranceChallenge = createServerFn({ method: "POST" })
  .validator((input: unknown): RejectChallengeSubmission => {
    const submission = parseRejectChallengeSubmission(input);
    if (submission === null) {
      throw new Error("malformed reject challenge submission");
    }
    return submission;
  })
  .handler(async ({ data }): Promise<RejectChallengeOutcome> => {
    const request = getRequest();
    return rejectHighAssuranceChallengeForRequest(
      {
        cookieHeader: request.headers.get("Cookie"),
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      data,
    );
  });
