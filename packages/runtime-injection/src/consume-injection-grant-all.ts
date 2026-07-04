import type { Keyring, PlaintextHandle } from "@insecur/crypto";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import { recordRuntimeInjectionAudit } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  environmentId,
  projectId,
  type InjectionGrantId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import {
  assertUserActorForConsume,
  reasonCodeForConsumeFailure,
  runConsumeWithAuditDenialHandling,
} from "./consume-injection-grant-shared.js";
import { recordDeniedConsume } from "./consume-injection-grant.js";
import { decryptBoundGrantSecretVersion } from "./decrypt-grant-secret.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

export interface ConsumeInjectionGrantAllCoreInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

interface ConsumedInjectionGrantEntry {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  valueUtf8: PlaintextHandle;
}

export interface ConsumeInjectionGrantAllCoreResult {
  entries: readonly ConsumedInjectionGrantEntry[];
  auditEventId?: string;
}

interface LoadedPolicyGrantBindings {
  projectId: ReturnType<typeof projectId.brand>;
  environmentId: ReturnType<typeof environmentId.brand>;
  bindings: readonly {
    secretId: SecretId;
    secretVersionId: SecretVersionId;
    variableKey: VariableKey;
  }[];
}

async function loadPolicyGrantBindings(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<LoadedPolicyGrantBindings | undefined> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    const store = new TenantInjectionGrantStore(db);
    const grant = await store.getGrant(organizationId, grantId);
    if (!grant || !store.isPolicyBackedGrant(grant)) {
      return undefined;
    }
    const bindings = store.getBoundGrants(grant);
    if (!bindings || bindings.length === 0) {
      return undefined;
    }
    return {
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
      bindings: bindings.map((binding) => ({
        secretId: binding.secretId,
        secretVersionId: binding.secretVersionId,
        variableKey: binding.variableKey,
      })),
    };
  });
}

async function decryptConsumedBindings(input: {
  readonly keyring: Keyring;
  readonly organizationId: OrganizationId;
  readonly projectId: LoadedPolicyGrantBindings["projectId"];
  readonly environmentId: LoadedPolicyGrantBindings["environmentId"];
  readonly grants: readonly {
    secretId: SecretId;
    secretVersionId: SecretVersionId;
    variableKey: VariableKey;
  }[];
}): Promise<ConsumedInjectionGrantEntry[]> {
  const entries: ConsumedInjectionGrantEntry[] = [];
  for (const binding of input.grants) {
    const plaintext = await decryptBoundGrantSecretVersion({
      keyring: input.keyring,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: binding.secretId,
      secretVersionId: binding.secretVersionId,
    });
    entries.push({
      secretId: binding.secretId,
      secretVersionId: binding.secretVersionId,
      variableKey: binding.variableKey,
      valueUtf8: plaintext,
    });
  }
  return entries;
}

function requireLoadedPolicyGrant(
  loaded: LoadedPolicyGrantBindings | undefined,
): LoadedPolicyGrantBindings {
  if (!loaded) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "injection grant consume denied",
    );
  }
  return loaded;
}

async function recordConsumeAllSuccessAudit(input: {
  readonly actor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly grantId: InjectionGrantId;
  readonly loaded: LoadedPolicyGrantBindings;
  readonly request?: AuditRequestRef;
  readonly operation?: AuditOperationRef;
}): Promise<{ auditEventId?: string } | undefined> {
  return recordRuntimeInjectionAudit({
    phase: "consume",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.loaded.projectId,
    environmentId: input.loaded.environmentId,
    grantId: input.grantId,
    ...(input.loaded.bindings[0]?.secretVersionId !== undefined
      ? { deliveredSecretVersionId: input.loaded.bindings[0].secretVersionId }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

async function executeConsumeInjectionGrantAll(
  input: ConsumeInjectionGrantAllCoreInput,
  loaded: LoadedPolicyGrantBindings | undefined,
): Promise<ConsumeInjectionGrantAllCoreResult> {
  assertUserActorForConsume(input.actor);
  const policyGrant = requireLoadedPolicyGrant(loaded);

  const grantCoordinate: GrantCoordinate = {
    organizationId: input.organizationId,
    projectId: policyGrant.projectId,
    environmentId: policyGrant.environmentId,
  };

  await assertRuntimeInjectionAccess(input.actor, grantCoordinate, CONSUME_SCOPE);

  const consumeResult = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantInjectionGrantStore(db).tryConsumeGrantAll(input.organizationId, input.grantId),
  );
  if (!consumeResult.ok) {
    throw new InjectionGrantError(
      reasonCodeForConsumeFailure(consumeResult.reason),
      "injection grant consume denied",
    );
  }

  const entries = await decryptConsumedBindings({
    keyring: input.keyring,
    organizationId: input.organizationId,
    projectId: policyGrant.projectId,
    environmentId: policyGrant.environmentId,
    grants: consumeResult.grants,
  });

  const audit = await recordConsumeAllSuccessAudit({
    actor: input.actor,
    organizationId: input.organizationId,
    grantId: input.grantId,
    loaded: policyGrant,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return {
    entries,
    ...(audit?.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

export async function consumeInjectionGrantAllWithAudit(
  input: ConsumeInjectionGrantAllCoreInput,
): Promise<ConsumeInjectionGrantAllCoreResult> {
  const loaded = await loadPolicyGrantBindings(input.organizationId, input.grantId);
  const coordinate = loaded
    ? { projectId: loaded.projectId, environmentId: loaded.environmentId }
    : undefined;
  return runConsumeWithAuditDenialHandling({
    run: () => executeConsumeInjectionGrantAll(input, loaded),
    recordDenied: (reasonCode) => recordDeniedConsume(input, reasonCode, coordinate),
  });
}
