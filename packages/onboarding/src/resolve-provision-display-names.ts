import { parseDisplayName, type DisplayName } from "@insecur/domain";
import { GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES } from "./default-display-names.js";
import { GuidedOrganizationProvisionError } from "./provision-guided-organization-error.js";
import type { ProvisionGuidedOrganizationInput } from "./provision-guided-organization-types.js";

function resolveDisplayName(override: DisplayName | undefined, fallback: string): DisplayName {
  if (override !== undefined) {
    return override;
  }
  const parsed = parseDisplayName(fallback);
  if (!parsed.ok) {
    throw new GuidedOrganizationProvisionError(
      parsed.code,
      "guided organization default display name is invalid",
    );
  }
  return parsed.value;
}

export interface ResolvedProvisionDisplayNames {
  organizationDisplayName: DisplayName;
  projectDisplayName: DisplayName;
  teamDisplayName: DisplayName;
  environmentDisplayName: DisplayName;
}

export function resolveProvisionDisplayNames(
  input: ProvisionGuidedOrganizationInput,
): ResolvedProvisionDisplayNames {
  return {
    organizationDisplayName: resolveDisplayName(
      input.organizationDisplayName,
      GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.organization,
    ),
    projectDisplayName: resolveDisplayName(
      input.projectDisplayName,
      GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.project,
    ),
    teamDisplayName: resolveDisplayName(
      input.teamDisplayName,
      GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.team,
    ),
    environmentDisplayName: resolveDisplayName(
      input.environmentDisplayName,
      GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.environment,
    ),
  };
}
