import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  environmentId,
  INJECTION_ERROR_CODES,
  projectId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";
import {
  TenantInjectionGrantStore,
  type InjectionGrantConsumeFailure,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import { decryptBoundGrantSecretVersion } from "./decrypt-grant-secret.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantConsumeSelector } from "./injection-grant-selectors.js";
import { matchConsumeSelectorToBinding } from "./match-consume-selector.js";
import { recordInjectionGrantAudit } from "./record-injection-grant-audit.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

export interface ConsumeInjectionGrantCoreInput {
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  selector: InjectionGrantConsumeSelector;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface ConsumeInjectionGrantCoreResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  valueUtf8: Uint8Array;
  auditEventId?: string;
}

function reasonCodeForConsumeFailure(
  reason: InjectionGrantConsumeFailure,
): (typeof INJECTION_ERROR_CODES)[keyof typeof INJECTION_ERROR_CODES] {
  if (reason === "expired") {
    return INJECTION_ERROR_CODES.grantExpired;
  }
  return INJECTION_ERROR_CODES.grantDenied;
}

export interface LoadedGrantBinding {
  projectId: ProjectId;
  environmentId: EnvironmentId;
  binding: {
    secretId: SecretId;
    secretVersionId: SecretVersionId;
    variableKey: VariableKey;
  };
}

async function loadGrantBinding(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<LoadedGrantBinding | undefined> {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const store = new TenantInjectionGrantStore(sql);
    const grant = await store.getGrant(organizationId, grantId);
    if (!grant) {
      return undefined;
    }
    const bound = store.getBoundGrant(grant);
    if (!bound) {
      return undefined;
    }
    return {
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
      binding: {
        secretId: bound.secretId,
        secretVersionId: bound.secretVersionId,
        variableKey: bound.variableKey,
      },
    };
  });
}

export async function executeConsumeInjectionGrant(
  input: ConsumeInjectionGrantCoreInput,
  loaded: LoadedGrantBinding | undefined,
): Promise<ConsumeInjectionGrantCoreResult> {
  if (!loaded) {
    throw new InjectionGrantError(INJECTION_ERROR_CODES.grantDenied, "injection grant not found");
  }

  const grantCoordinate: GrantCoordinate = {
    organizationId: input.organizationId,
    projectId: loaded.projectId,
    environmentId: loaded.environmentId,
  };

  await assertRuntimeInjectionAccess(
    { type: "user", userId: input.actor.userId },
    grantCoordinate,
    CONSUME_SCOPE,
  );

  const identity = matchConsumeSelectorToBinding(input.selector, loaded.binding);

  const consumeResult = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    (sql) =>
      new TenantInjectionGrantStore(sql).tryConsumeGrant(
        input.organizationId,
        input.grantId,
        identity.secretId,
        identity.variableKey,
      ),
  );
  if (!consumeResult.ok) {
    throw new InjectionGrantError(
      reasonCodeForConsumeFailure(consumeResult.reason),
      "injection grant consume denied",
    );
  }

  const plaintext = await decryptBoundGrantSecretVersion({
    organizationId: input.organizationId,
    projectId: loaded.projectId,
    environmentId: loaded.environmentId,
    secretId: loaded.binding.secretId,
    secretVersionId: loaded.binding.secretVersionId,
  });

  return buildConsumeSuccessResult(input, loaded, plaintext);
}

async function buildConsumeSuccessResult(
  input: ConsumeInjectionGrantCoreInput,
  loaded: {
    projectId: ProjectId;
    environmentId: EnvironmentId;
    binding: {
      secretId: SecretId;
      secretVersionId: SecretVersionId;
      variableKey: VariableKey;
    };
  },
  plaintext: Uint8Array,
): Promise<ConsumeInjectionGrantCoreResult> {
  const audit = await recordInjectionGrantAudit({
    phase: "consume",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: loaded.projectId,
    environmentId: loaded.environmentId,
    grantId: input.grantId,
    deliveredSecretVersionId: loaded.binding.secretVersionId,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return {
    secretId: loaded.binding.secretId,
    secretVersionId: loaded.binding.secretVersionId,
    variableKey: loaded.binding.variableKey,
    valueUtf8: plaintext,
    ...(audit?.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

export async function recordDeniedConsume(
  input: ConsumeInjectionGrantCoreInput,
  reasonCode: InjectionGrantError["code"],
  coordinate?: { projectId: ProjectId; environmentId: EnvironmentId },
): Promise<void> {
  await recordInjectionGrantAudit({
    phase: "consume",
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    grantId: input.grantId,
    reasonCode,
    ...(coordinate !== undefined
      ? { projectId: coordinate.projectId, environmentId: coordinate.environmentId }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function consumeInjectionGrantWithAudit(
  input: ConsumeInjectionGrantCoreInput,
): Promise<ConsumeInjectionGrantCoreResult> {
  const loaded = await loadGrantBinding(input.organizationId, input.grantId);
  const coordinate = loaded
    ? { projectId: loaded.projectId, environmentId: loaded.environmentId }
    : undefined;
  try {
    return await executeConsumeInjectionGrant(input, loaded);
  } catch (error) {
    if (error instanceof InjectionGrantError) {
      await recordDeniedConsume(input, error.code, coordinate).catch(() => undefined);
    }
    throw error;
  }
}
