import type { OrganizationId } from "@insecur/domain";
import { operationId, type OperationId } from "@insecur/domain";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";

export function requireOrganizationScope(scope: ResolvedCliScope): OrganizationId {
  if (scope.orgId === undefined) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message:
        "Missing organization scope. Run insecur init or pass --org-id before addressing operations.",
      retryable: false,
    });
  }
  return scope.orgId;
}

export function parseOperationIdOrThrow(raw: string): OperationId {
  const parsed = operationId.parse(raw);
  if (!parsed.ok) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "Invalid operation id.",
      retryable: false,
    });
  }
  return parsed.value;
}
