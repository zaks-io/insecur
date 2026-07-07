import type { OrganizationId } from "@insecur/domain";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";

export interface ResolvedOrganizationScope {
  readonly orgId: OrganizationId;
}

export function requireOrganizationScope(scope: ResolvedCliScope): ResolvedOrganizationScope {
  if (scope.orgId === undefined) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "Missing organization scope. Run insecur init or pass --org-id.",
      retryable: false,
    });
  }
  return { orgId: scope.orgId };
}
