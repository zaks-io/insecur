import { decryptSecretValueForRuntime, type Keyring, type PlaintextHandle } from "@insecur/crypto";
import {
  INJECTION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import {
  SecretVersionStoreConflictError,
  TenantSecretVersionStore,
  withTenantScope,
  type TenantScopedDb,
  type SecretVersionStoreRow,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";

export async function decryptBoundGrantSecretVersion(input: {
  keyring: Keyring;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
}): Promise<PlaintextHandle> {
  const wrapped = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => loadDeliverableWrappedSecretVersion(input, db),
  );

  return await decryptSecretValueForRuntime(
    input.keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: input.secretId,
    },
    wrapped,
  );
}

async function loadDeliverableWrappedSecretVersion(
  input: {
    secretId: SecretId;
    secretVersionId: SecretVersionId;
  },
  db: TenantScopedDb,
): Promise<SecretVersionStoreRow["wrapped"]> {
  let version;
  try {
    version = await new TenantSecretVersionStore(db).getDeliverableVersion(
      input.secretId,
      input.secretVersionId,
    );
  } catch (error) {
    if (error instanceof SecretVersionStoreConflictError) {
      throw new InjectionGrantError(
        INJECTION_ERROR_CODES.grantDenied,
        "bound secret version not deliverable",
      );
    }
    throw error;
  }
  if (!version) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "bound secret version not found",
    );
  }

  return version.wrapped;
}
