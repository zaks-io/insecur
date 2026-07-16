import type { WrappedSecretValue } from "@insecur/crypto";
import type { SecretId, SecretVersionId } from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
  type AppendSecretVersionResult,
  type EnvironmentLifecycleRow,
} from "@insecur/tenant-store";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import type {
  BlindSecretWriteMode,
  BlindSecretWriteResult,
  ValidatedBlindWriteInput,
} from "./blind-secret-write-types.js";
import type { SecretStorageWriteAuditKind } from "./record-secret-storage-write-audit.js";
import { recordSecretStorageWriteAuditInTenantScope } from "./record-secret-storage-write-audit.js";
import {
  toSecretVersionCreatorActor,
  toStoredWrappedSecretMaterial,
} from "./secret-version-write-mappers.js";

export interface ResolvedSecretForWrite {
  readonly secretId: SecretId;
  readonly createdSecretShape: boolean;
}

export interface AppendWrappedVersionForWriteInput {
  readonly validatedInput: ValidatedBlindWriteInput;
  readonly newVersionId: SecretVersionId;
  readonly mode: BlindSecretWriteMode;
  readonly resolved: ResolvedSecretForWrite;
  readonly wrapped: WrappedSecretValue;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

export function auditKindForMode(mode: BlindSecretWriteMode): SecretStorageWriteAuditKind {
  return mode === "protected_draft" ? "protected_draft" : "non_protected";
}

export async function resolveWritableSecretForWrite(
  validatedInput: ValidatedBlindWriteInput,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<ResolvedSecretForWrite> {
  return withTenantScope(
    { kind: "organization", organizationId: validatedInput.organizationId },
    async ({ db }) => {
      const environmentStore = new TenantEnvironmentLifecycleStore(db);
      const environment = await environmentStore.getById(
        validatedInput.organizationId,
        validatedInput.environmentId,
      );
      assertEnvironment(environment);

      const store = new TenantSecretVersionStore(db);
      return store.resolveSecretForWrite({
        organizationId: validatedInput.organizationId,
        projectId: validatedInput.projectId,
        environmentId: validatedInput.environmentId,
        variableKey: validatedInput.variableKey,
        ...(validatedInput.secretId !== undefined ? { secretId: validatedInput.secretId } : {}),
      });
    },
  );
}

export type PersistedSecretVersionWithAudit = AppendSecretVersionResult & {
  auditEventId: BlindSecretWriteResult["auditEventId"];
};

/**
 * Appends the wrapped version and records the success audit on the same
 * tenant-scoped transaction, so the secret mutation and its success audit
 * commit or roll back as one durable outcome. Live appends carry the
 * `ifCurrentVersionAbsent` version-conditional guard (INS-609) into the store,
 * where it is enforced under the append row lock.
 */
export async function appendWrappedVersionForWrite({
  validatedInput,
  newVersionId,
  mode,
  resolved,
  wrapped,
  descriptiveVerdicts,
}: AppendWrappedVersionForWriteInput): Promise<PersistedSecretVersionWithAudit> {
  return withTenantScope(
    { kind: "organization", organizationId: validatedInput.organizationId },
    async ({ db, sql }) => {
      const store = new TenantSecretVersionStore(db);
      const appendInput = {
        organizationId: validatedInput.organizationId,
        secretId: resolved.secretId,
        secretVersionId: newVersionId,
        wrapped: toStoredWrappedSecretMaterial(wrapped),
        createdSecretShape: resolved.createdSecretShape,
        descriptiveVerdicts,
        createdByActor: toSecretVersionCreatorActor(validatedInput.actor),
      };

      const persisted =
        mode === "protected_draft"
          ? await store.appendVersionAsDraft(appendInput)
          : await store.appendVersionAndMakeLive({
              ...appendInput,
              ...(validatedInput.ifCurrentVersionAbsent === true
                ? { ifCurrentVersionAbsent: true }
                : {}),
            });

      const audit = await recordSecretStorageWriteAuditInTenantScope(sql, auditKindForMode(mode), {
        outcome: "success",
        actor: validatedInput.actor,
        organizationId: validatedInput.organizationId,
        projectId: validatedInput.projectId,
        environmentId: validatedInput.environmentId,
        secretId: persisted.secretId,
        secretVersionId: persisted.secretVersionId,
        ...(validatedInput.request !== undefined ? { request: validatedInput.request } : {}),
        ...(validatedInput.operation !== undefined ? { operation: validatedInput.operation } : {}),
      });

      return { ...persisted, auditEventId: audit.auditEventId };
    },
  );
}
