import {
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import {
  resolveSecretForRead,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantSecretVersionStore,
  type ResolvedInjectionGrantBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";

function grantDeniedForUnresolvedSelector(error: unknown): never {
  if (
    error instanceof SecretVersionStoreNotFoundError ||
    error instanceof SecretVersionStoreConflictError
  ) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection grant selector does not resolve to a secret",
    );
  }
  throw error;
}

export interface GrantCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export async function resolveInjectionGrantBinding(
  coordinate: GrantCoordinate,
  selector: InjectionGrantIssueSelector,
): Promise<ResolvedInjectionGrantBinding> {
  return withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async (sql) => {
      const versionStore = new TenantSecretVersionStore(sql);
      let resolved;
      try {
        resolved = await resolveSecretForRead(
          sql,
          selector.kind === "variable_key"
            ? {
                organizationId: coordinate.organizationId,
                projectId: coordinate.projectId,
                environmentId: coordinate.environmentId,
                variableKey: selector.variableKey,
              }
            : {
                organizationId: coordinate.organizationId,
                projectId: coordinate.projectId,
                environmentId: coordinate.environmentId,
                secretId: selector.secretId,
              },
        );
      } catch (error) {
        grantDeniedForUnresolvedSelector(error);
      }
      const boundVersion = await versionStore.getCurrentVersion(resolved.secretId);
      if (!boundVersion) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "secret has no current version",
        );
      }

      return {
        secretId: resolved.secretId,
        secretVersionId: boundVersion.secretVersionId,
        variableKey: resolved.variableKey,
      };
    },
  );
}
