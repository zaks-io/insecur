import { AUTH_ERROR_CODES, parseDisplayName } from "@insecur/domain";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isWizardMutationCsrfValid } from "../onboarding/csrf-check.js";
import {
  parseProvisionOutcome,
  parseProvisionSubmission,
  type ProvisionOutcome,
  type ProvisionSubmission,
} from "../onboarding/provisioning.js";
import { resolveAuthenticatedApiClient, type BffApiClient } from "./bff-api.js";

/**
 * The wizard's only mutation: Guided Organization Provisioning over the BFF scoped-token hop
 * (ADR-0051). CSRF is the double-submit check against the session's `insecur_csrf` cookie; the
 * provisioning itself is audited by the Runtime Worker (`recordProvisionSuccess`). The browser
 * sends metadata only and receives metadata only.
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
    if (!isWizardMutationCsrfValid(request.headers.get("Cookie"), data.csrfToken)) {
      return { ok: false, code: "web.csrf_rejected" };
    }

    const client = await resolveAuthenticatedApiClient();
    if (client === null) {
      return { ok: false, code: AUTH_ERROR_CODES.required };
    }

    return runProvisioning(client.api, data);
  });

async function runProvisioning(
  api: BffApiClient,
  submission: ProvisionSubmission,
): Promise<ProvisionOutcome> {
  const organizationName = parseDisplayName(submission.organizationName);
  const projectName = parseDisplayName(submission.projectName);
  if (!organizationName.ok) {
    return { ok: false, code: organizationName.code };
  }
  if (!projectName.ok) {
    return { ok: false, code: projectName.code };
  }

  const body: unknown = await api.provisionPersonalOrganization({
    organizationDisplayName: organizationName.value,
    projectDisplayName: projectName.value,
    resourceIds: submission.resourceIds,
  });
  return parseProvisionOutcome(body);
}
