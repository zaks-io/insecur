import { buildPersonalOrganizationRequestBody } from "./provision-request-body.js";
import type {
  GuidedOrganizationProvisionData,
  OnboardingApiClient,
} from "./onboarding-api-types.js";
import { parseEnvelope, postAuthorizedJson } from "./http-client-envelope.js";

export async function provisionPersonalOrganization(
  base: string,
  input: Parameters<OnboardingApiClient["provisionPersonalOrganization"]>[0],
) {
  const body = buildPersonalOrganizationRequestBody({
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
  });
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    "/v1/onboarding/personal-organization",
    input.bearerCredential,
    body,
  );
  const envelope = parseEnvelope<GuidedOrganizationProvisionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
