import { encryptSecretValue } from "@insecur/crypto";
import type { SecretVersionId } from "@insecur/domain";
import {
  TenantSecretVersionStore,
  withTenantScope,
  type AppendSecretVersionAndMakeLiveResult,
} from "@insecur/tenant-store";

import { toStoredWrappedSecretMaterial } from "./wrapped-secret-material.js";
import type { WriteNonProtectedSecretInput } from "./write-non-protected-secret.js";

export async function persistNonProtectedWrite(
  input: WriteNonProtectedSecretInput,
  secretVersionIdValue: SecretVersionId,
): Promise<AppendSecretVersionAndMakeLiveResult> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantSecretVersionStore(sql);
      const resolved = await store.resolveSecretForWrite({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        variableKey: input.variableKey,
        ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
      });

      const wrapped = await encryptSecretValue(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          secretId: resolved.secretId,
        },
        input.valueUtf8,
      );

      return store.appendVersionAndMakeLive({
        organizationId: input.organizationId,
        secretId: resolved.secretId,
        secretVersionId: secretVersionIdValue,
        wrapped: toStoredWrappedSecretMaterial(wrapped),
        createdSecretShape: resolved.createdSecretShape,
      });
    },
  );
}

export function toWriteResult(
  input: WriteNonProtectedSecretInput,
  persisted: AppendSecretVersionAndMakeLiveResult,
  auditEventId?: string,
) {
  return {
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    variableKey: input.variableKey,
    createdSecretShape: persisted.createdSecretShape,
    ...(auditEventId !== undefined ? { auditEventId } : {}),
  };
}
