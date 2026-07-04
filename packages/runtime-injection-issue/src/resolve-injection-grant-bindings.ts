import {
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import { resolveBindingForSelector } from "./resolve-single-grant-binding.js";

export interface GrantCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export async function resolveInjectionGrantBinding(
  coordinate: GrantCoordinate,
  selector: InjectionGrantIssueSelector,
) {
  if (selector.kind === "policy_id") {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "policy selectors require resolveInjectionGrantBindings",
    );
  }
  return resolveBindingForSelector(coordinate, selector);
}
