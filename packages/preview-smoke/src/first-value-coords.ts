import type { Sentinel } from "./redaction.js";
import { assertEnvelopeData, postJson, requireString } from "./http.js";

export interface FirstValueCoords {
  defaultTeamId: string;
  environmentId: string;
  organizationId: string;
  ownerMembershipId: string;
  projectId: string;
  variableKey: string;
}

export interface ProvisionFirstValueCoordsInput {
  apiBaseUrl: string;
  bearer: string;
  redactor: (value: unknown) => string;
  sentinel: Sentinel;
  variableKey: string;
}

export async function provisionFirstValueCoords(
  input: ProvisionFirstValueCoordsInput,
): Promise<FirstValueCoords> {
  const onboarding = await postJson({
    bearer: input.bearer,
    body: {},
    label: "Guided onboarding",
    redactor: input.redactor,
    url: `${input.apiBaseUrl}/v1/onboarding/personal-organization`,
  });
  const onboardingData = assertEnvelopeData(onboarding, "Guided onboarding");

  const coords: FirstValueCoords = {
    defaultTeamId: requireString(onboardingData.defaultTeamId, "onboarding defaultTeamId"),
    environmentId: requireString(
      onboardingData.developmentEnvironmentId,
      "onboarding developmentEnvironmentId",
    ),
    organizationId: requireString(onboardingData.organizationId, "onboarding organizationId"),
    ownerMembershipId: requireString(
      onboardingData.ownerMembershipId,
      "onboarding ownerMembershipId",
    ),
    projectId: requireString(onboardingData.projectId, "onboarding projectId"),
    variableKey: input.variableKey,
  };

  await postJson({
    bearer: input.bearer,
    body: {
      organizationId: coords.organizationId,
      value: input.sentinel.value,
      variableKey: input.variableKey,
    },
    label: "Secret write",
    redactor: input.redactor,
    url: `${input.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${coords.environmentId}/secrets/by-variable-key`,
  });

  return coords;
}
