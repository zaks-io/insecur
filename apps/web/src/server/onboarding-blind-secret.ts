import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { blindSecretWriteForRequest } from "../onboarding/blind-secret-write-for-request.js";
import {
  parseBlindSecretWriteSubmission,
  type BlindSecretWriteOutcome,
  type BlindSecretWriteSubmission,
} from "../onboarding/blind-secret-write.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

/**
 * The wizard's optional blind secret write (INS-379, ADR-0052/0079). CSRF-protected server-fn
 * mutation over the BFF scoped-token hop; the browser sends metadata only and receives a Metadata
 * Receipt only.
 */
export const writeOnboardingBlindSecret = createServerFn({ method: "POST" })
  .validator((input: unknown): BlindSecretWriteSubmission => {
    const submission = parseBlindSecretWriteSubmission(input);
    if (submission === null) {
      throw new Error("malformed blind secret write submission");
    }
    return submission;
  })
  .handler(async ({ data }): Promise<BlindSecretWriteOutcome> => {
    const request = getRequest();
    return blindSecretWriteForRequest(
      {
        cookieHeader: request.headers.get("Cookie"),
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      data,
    );
  });
