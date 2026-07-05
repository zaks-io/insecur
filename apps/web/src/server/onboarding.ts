import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { provisionWorkspaceForRequest } from "../onboarding/provision-workspace.js";
import {
  parseProvisionSubmission,
  type ProvisionOutcome,
  type ProvisionSubmission,
} from "../onboarding/provisioning.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

/**
 * The wizard's only mutation: Guided Organization Provisioning over the BFF scoped-token hop
 * (ADR-0051). The decision path (CSRF double-submit, authenticated client, Display Name
 * validation, envelope parsing) lives in `provisionWorkspaceForRequest`; the provisioning itself
 * is audited by the Runtime Worker (`recordProvisionSuccess`). The browser sends metadata only
 * and receives metadata only.
 */
export const provisionOnboardingWorkspace = createServerFn({ method: "POST" })
  .validator((input: unknown): ProvisionSubmission => {
    const submission = parseProvisionSubmission(input);
    if (submission === null) {
      throw new Error("malformed onboarding submission");
    }
    return submission;
  })
  .handler(async ({ data }): Promise<ProvisionOutcome> => {
    const request = getRequest();
    return provisionWorkspaceForRequest(
      {
        cookieHeader: request.headers.get("Cookie"),
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      data,
    );
  });
