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
  TenantSecretVersionStore,
  withTenantScope,
  type TenantScopedDb,
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
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => decryptResolvedVersion(input, db),
  );
}

async function decryptResolvedVersion(
  input: {
    keyring: Keyring;
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    secretId: SecretId;
    secretVersionId: SecretVersionId;
  },
  db: TenantScopedDb,
): Promise<PlaintextHandle> {
  const version = await new TenantSecretVersionStore(db).getVersionById(
    input.secretId,
    input.secretVersionId,
  );
  if (!version) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "bound secret version not found",
    );
  }

  return await decryptSecretValueForRuntime(
    input.keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: input.secretId,
    },
    version.wrapped,
  );
}
