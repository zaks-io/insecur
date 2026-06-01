import { decryptSecretValueForRuntime, DecryptError } from "@insecur/crypto";
import {
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";
import {
  TenantSecretVersionStore,
  withTenantScope,
  type TenantScopedSql,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";

export async function decryptGrantSecretById(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
}): Promise<Uint8Array> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => decryptResolvedSecret(input, input.secretId, sql),
  );
}

async function decryptResolvedSecret(
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
  resolvedSecretId: SecretId,
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
