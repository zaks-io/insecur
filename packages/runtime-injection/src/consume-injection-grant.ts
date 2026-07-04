import type { Keyring, PlaintextHandle } from "@insecur/crypto";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  environmentId,
  projectId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import {
  assertUserActorForConsume,
  reasonCodeForConsumeFailure,
  recordConsumeDeniedAudit,
  runConsumeWithAuditDenialHandling,
} from "./consume-injection-grant-shared.js";
import { decryptBoundGrantSecretVersion } from "./decrypt-grant-secret.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantConsumeSelector } from "./injection-grant-selectors.js";
import { matchConsumeSelectorToBinding } from "./match-consume-selector.js";
import { recordRuntimeInjectionAudit } from "@insecur/audit";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

export interface ConsumeInjectionGrantCoreInput {
  keyring: Keyring;
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
  valueUtf8: PlaintextHandle;
  auditEventId?: string;
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
  return withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    const store = new TenantInjectionGrantStore(db);
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
  assertUserActorForConsume(input.actor);

  // A consume grant pins its own project/environment, so the authorization coordinate is only known
  // after the grant loads. A not-found grant therefore cannot be authorized, and surfacing
  // `grant_denied` here would let a caller distinguish "grant absent" from "grant present but I lack
  // scope" (which the per-coordinate check below returns as `insufficient_scope`). Both collapse to
  // `insufficient_scope` so the consume path is not a grant-existence oracle (mirrors the issuance
  // pre-check, INS-181). Authorizing at the grant's real coordinate — not a coarse org coordinate —
  // is what keeps a legitimately project-scoped consumer (e.g. the developer preset) from being
  // wrongly denied for a valid grant in their own project.
  if (!loaded) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "injection grant consume denied",
    );
  }

  const grantCoordinate: GrantCoordinate = {
    organizationId: input.organizationId,
    projectId: loaded.projectId,
    environmentId: loaded.environmentId,
  };

  await assertRuntimeInjectionAccess(input.actor, grantCoordinate, CONSUME_SCOPE);

  const identity = matchConsumeSelectorToBinding(input.selector, loaded.binding);

  const consumeResult = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantInjectionGrantStore(db).tryConsumeGrant(
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
    keyring: input.keyring,
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
  plaintext: PlaintextHandle,
): Promise<ConsumeInjectionGrantCoreResult> {
  const audit = await recordRuntimeInjectionAudit({
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
  input: {
    actor: AuditActorRef;
    organizationId: OrganizationId;
    grantId: InjectionGrantId;
    request?: AuditRequestRef;
    operation?: AuditOperationRef;
  },
  reasonCode: InjectionGrantError["code"],
  coordinate?: { projectId: ProjectId; environmentId: EnvironmentId },
): Promise<void> {
  await recordConsumeDeniedAudit({
    actor: input.actor,
    organizationId: input.organizationId,
    grantId: input.grantId,
    reasonCode,
    ...(coordinate !== undefined ? { coordinate } : {}),
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
  return runConsumeWithAuditDenialHandling({
    run: () => executeConsumeInjectionGrant(input, loaded),
    recordDenied: (reasonCode) => recordDeniedConsume(input, reasonCode, coordinate),
  });
}
