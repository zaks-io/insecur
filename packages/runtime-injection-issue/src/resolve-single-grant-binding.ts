import { INJECTION_ERROR_CODES, type SecretId, type VariableKey } from "@insecur/domain";
import {
  resolveSecretForRead,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantSecretVersionStore,
  type ResolvedInjectionGrantBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

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

export async function resolveBindingForSelector(
  coordinate: GrantCoordinate,
  selector:
    { kind: "variable_key"; variableKey: VariableKey } | { kind: "secret_id"; secretId: SecretId },
): Promise<ResolvedInjectionGrantBinding> {
  return withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async ({ db }) => {
      const versionStore = new TenantSecretVersionStore(db);
      let resolved;
      try {
        resolved = await resolveSecretForRead(
          db,
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
