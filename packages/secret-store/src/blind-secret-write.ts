import { auditAccessDenialOnFailure } from "@insecur/access";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import { encryptSecretValue, type Keyring, type WrappedSecretValue } from "@insecur/crypto";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import { AUTH_ERROR_CODES, secretVersionId } from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
  type AppendSecretVersionResult,
  type EnvironmentLifecycleRow,
  type SecretVersionLifecycleState,
} from "@insecur/tenant-store";
import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import { SecretWriteError } from "./secret-write-error.js";
import {
  recordDeniedSecretStorageWriteAudit,
  recordSecretStorageWriteAuditInTenantScope,
  type SecretStorageWriteAuditKind,
} from "./record-secret-storage-write-audit.js";
import { validateTextSecretValue } from "./validate-text-secret-value.js";
import { validateVariableKeyForWrite } from "./validate-variable-key-for-write.js";
import { assertCreateOnlySecretWrite } from "./assert-create-only-secret-write.js";
import {
  toSecretVersionCreatorActor,
  toStoredWrappedSecretMaterial,
} from "./secret-version-write-mappers.js";

export interface BlindSecretWriteInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  actor: AuditActorRef;
  secretId?: SecretId;
  valueUtf8: Uint8Array;
  allowEmpty?: boolean;
  createOnly?: boolean;
  generationHint?: string | null;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface BlindSecretWriteResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  lifecycleState: SecretVersionLifecycleState;
  createdSecretShape: boolean;
  descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
  auditEventId?: string;
}

type ValidatedBlindWriteInput = BlindSecretWriteInput & { variableKey: VariableKey };

export type BlindSecretWriteMode = "non_protected_live" | "protected_draft";

interface ResolvedSecretForWrite {
  readonly secretId: SecretId;
  readonly createdSecretShape: boolean;
}

interface AppendWrappedVersionForWriteInput {
  readonly validatedInput: ValidatedBlindWriteInput;
  readonly newVersionId: SecretVersionId;
  readonly mode: BlindSecretWriteMode;
  readonly resolved: ResolvedSecretForWrite;
  readonly wrapped: WrappedSecretValue;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

function auditKindForMode(mode: BlindSecretWriteMode): SecretStorageWriteAuditKind {
  return mode === "protected_draft" ? "protected_draft" : "non_protected";
}

async function resolveWritableSecretForWrite(
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

type PersistedSecretVersionWithAudit = AppendSecretVersionResult & {
  auditEventId: BlindSecretWriteResult["auditEventId"];
};

/**
 * Appends the wrapped version and records the success audit on the same
 * tenant-scoped transaction, so the secret mutation and its success audit
 * commit or roll back as one durable outcome.
 */
async function appendWrappedVersionForWrite({
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
          : await store.appendVersionAndMakeLive(appendInput);

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

async function appendEncryptedVersionForWrite(
  validatedInput: ValidatedBlindWriteInput,
  newVersionId: SecretVersionId,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<PersistedSecretVersionWithAudit> {
  const resolved = await resolveWritableSecretForWrite(validatedInput, assertEnvironment);
  assertCreateOnlySecretWrite({
    ...(validatedInput.createOnly !== undefined ? { createOnly: validatedInput.createOnly } : {}),
    createdSecretShape: resolved.createdSecretShape,
  });
  const descriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({
    valueUtf8: validatedInput.valueUtf8,
    ...(validatedInput.generationHint !== undefined
      ? { generationHint: validatedInput.generationHint }
      : {}),
  });
  const wrapped = await encryptSecretValue(
    validatedInput.keyring,
    {
      organizationId: validatedInput.organizationId,
      projectId: validatedInput.projectId,
      environmentId: validatedInput.environmentId,
      secretId: resolved.secretId,
    },
    validatedInput.valueUtf8,
  );
  return appendWrappedVersionForWrite({
    validatedInput,
    newVersionId,
    mode,
    resolved,
    wrapped,
    descriptiveVerdicts,
  });
}

async function executeBlindSecretWrite(
  input: BlindSecretWriteInput,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<BlindSecretWriteResult> {
  const variableKey = validateVariableKeyForWrite(input.variableKey);
  const validatedInput: ValidatedBlindWriteInput = { ...input, variableKey };
  validateTextSecretValue(
    validatedInput.valueUtf8,
    validatedInput.allowEmpty === true ? { allowEmpty: true } : {},
  );
  const newVersionId = secretVersionId.generate();
  const persisted = await appendEncryptedVersionForWrite(
    validatedInput,
    newVersionId,
    mode,
    assertEnvironment,
  );

  return {
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    variableKey: validatedInput.variableKey,
    lifecycleState: persisted.lifecycleState,
    createdSecretShape: persisted.createdSecretShape,
    descriptiveVerdicts: persisted.descriptiveVerdicts,
    ...(persisted.auditEventId !== undefined ? { auditEventId: persisted.auditEventId } : {}),
  };
}

function isInsufficientScopeSecretWriteError(error: unknown): error is SecretWriteError {
  return error instanceof SecretWriteError && error.code === AUTH_ERROR_CODES.insufficientScope;
}

export async function runBlindSecretWrite(
  input: BlindSecretWriteInput,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<BlindSecretWriteResult> {
  const auditKind = auditKindForMode(mode);
  try {
    return await executeBlindSecretWrite(input, mode, assertEnvironment);
  } catch (error) {
    const scope = [input.organizationId, input.projectId, input.environmentId] as const;
    const refs = [input.secretId, input.request, input.operation] as const;
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isInsufficientScopeSecretWriteError,
      recordDenied: () =>
        recordDeniedSecretStorageWriteAudit({
          kind: auditKind,
          actor: input.actor,
          scope,
          refs,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        }),
    });
    if (error instanceof SecretWriteError && error.code !== AUTH_ERROR_CODES.insufficientScope) {
      await recordDeniedSecretStorageWriteAudit({
        kind: auditKind,
        actor: input.actor,
        scope,
        refs,
        reasonCode: error.code,
      }).catch(() => undefined);
    }
    throw error;
  }
}
