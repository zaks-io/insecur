import { decryptSecretValueForRuntime, DecryptError } from "@insecur/crypto";
import {
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import {
  resolveSecretForRead,
  TenantSecretVersionStore,
  withTenantScope,
  type TenantScopedSql,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";

export async function decryptGrantSecretValue(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
}): Promise<Uint8Array> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const resolvedSecretId = await resolveSecretForRead(sql, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        variableKey: input.variableKey,
      });
      return decryptResolvedSecret(input, resolvedSecretId, sql);
    },
  );
}

async function decryptResolvedSecret(
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
  resolvedSecretId: Awaited<ReturnType<typeof resolveSecretForRead>>,
  sql: TenantScopedSql,
): Promise<Uint8Array> {
  const version = await new TenantSecretVersionStore(sql).getCurrentVersion(resolvedSecretId);
  if (!version) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "secret has no current version",
    );
  }

  try {
    return await decryptSecretValueForRuntime(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        secretId: resolvedSecretId,
      },
      version.wrapped,
    );
  } catch (error) {
    if (error instanceof DecryptError) {
      throw new InjectionGrantError(INJECTION_ERROR_CODES.decryptFailed, "runtime decrypt failed");
    }
    if (error instanceof Error && error.message.includes("root key")) {
      throw new InjectionGrantError(
        CRYPTO_ERROR_CODES.rootKeyNotConfigured,
        "keyring not configured",
      );
    }
    throw error;
  }
}
