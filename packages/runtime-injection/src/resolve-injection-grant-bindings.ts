import {
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import {
  resolveSecretForRead,
  TenantSecretVersionStore,
  type ResolvedInjectionGrantBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";

export interface GrantCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export async function resolveInjectionGrantBindings(
  coordinate: GrantCoordinate,
  selectors: readonly InjectionGrantIssueSelector[],
): Promise<readonly ResolvedInjectionGrantBinding[]> {
  return withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async (sql) => {
      const versionStore = new TenantSecretVersionStore(sql);
      const bindings: ResolvedInjectionGrantBinding[] = [];

      for (const selector of selectors) {
        const resolved = await resolveSecretForRead(
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
        const current = await versionStore.getCurrentVersion(resolved.secretId);
        if (!current) {
          throw new InjectionGrantError(
            INJECTION_ERROR_CODES.grantDenied,
            "secret has no current version",
          );
        }
        bindings.push({
          secretId: resolved.secretId,
          variableKey: resolved.variableKey,
        });
      }

      return bindings;
    },
  );
}

export async function resolveConsumeSecretId(
  coordinate: GrantCoordinate,
  selector:
    | { kind: "variable_key"; variableKey: VariableKey }
    | { kind: "secret_id"; secretId: SecretId },
): Promise<{ secretId: SecretId; variableKey: VariableKey }> {
  return withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async (sql) => {
      const resolved = await resolveSecretForRead(
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
      return resolved;
    },
  );
}
