import type { Keyring, PlaintextHandle } from "@insecur/crypto";
import type { AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type { ActorRef } from "@insecur/access";
import { recordRuntimeInjectionAudit } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
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
  auditActorForConsume,
  reasonCodeForConsumeFailure,
} from "./consume-injection-grant-shared.js";
import {
  consumeLoadedGrantWithAudit,
  type LoadedGrantBinding,
  type ConsumeInjectionGrantGateInput,
} from "./consume-injection-grant.js";
import { actorMatchesGrantOwner, issuedToFromGrant } from "./injection-grant-owner.js";
import { decryptBoundGrantSecretVersion } from "./decrypt-grant-secret.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

export interface ConsumeInjectionGrantAllCoreInput extends ConsumeInjectionGrantGateInput {
  keyring: Keyring;
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
  issuedTo: LoadedGrantBinding["issuedTo"];
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
    const issuedTo = issuedToFromGrant(grant);
    if (!issuedTo) {
      return undefined;
    }
    return {
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
      issuedTo,
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
  try {
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
  } catch (error) {
    for (const entry of entries) {
      entry.valueUtf8.unwrapUtf8().fill(0);
    }
    throw error;
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
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly grantId: InjectionGrantId;
  readonly loaded: LoadedPolicyGrantBindings;
  readonly request?: AuditRequestRef;
  readonly operation?: AuditOperationRef;
}): Promise<{ auditEventId?: string } | undefined> {
  return recordRuntimeInjectionAudit({
    phase: "consume",
    outcome: "success",
    actor: auditActorForConsume(input.actor),
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

async function consumeGrantAllOrClear(
  input: ConsumeInjectionGrantAllCoreInput,
  entries: readonly ConsumedInjectionGrantEntry[],
): Promise<void> {
  const result = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantInjectionGrantStore(db).tryConsumeGrantAll(input.organizationId, input.grantId),
  );
  if (result.ok) {
    return;
  }
  for (const entry of entries) {
    entry.valueUtf8.unwrapUtf8().fill(0);
  }
  throw new InjectionGrantError(
    reasonCodeForConsumeFailure(result.reason),
    "injection grant consume denied",
  );
}

async function executeConsumeInjectionGrantAll(
  input: ConsumeInjectionGrantAllCoreInput,
  loaded: LoadedPolicyGrantBindings | undefined,
): Promise<ConsumeInjectionGrantAllCoreResult> {
  const policyGrant = requireLoadedPolicyGrant(loaded);
  if (!actorMatchesGrantOwner(input.actor, policyGrant.issuedTo)) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection grant consume denied",
    );
  }

  const grantCoordinate: GrantCoordinate = {
    organizationId: input.organizationId,
    projectId: policyGrant.projectId,
    environmentId: policyGrant.environmentId,
  };

  await assertRuntimeInjectionAccess(input.actor, grantCoordinate, CONSUME_SCOPE);

  const entries = await decryptConsumedBindings({
    keyring: input.keyring,
    organizationId: input.organizationId,
    projectId: policyGrant.projectId,
    environmentId: policyGrant.environmentId,
    grants: policyGrant.bindings,
  });

  await consumeGrantAllOrClear(input, entries);

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

  return consumeLoadedGrantWithAudit(input, loaded, () =>
    executeConsumeInjectionGrantAll(input, loaded),
  );
}
