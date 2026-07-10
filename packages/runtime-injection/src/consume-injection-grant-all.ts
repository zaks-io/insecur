import type { Keyring, PlaintextHandle } from "@insecur/crypto";
import { recordRuntimeInjectionAuditInTenantScope } from "@insecur/audit";
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

async function consumeGrantAllAndAudit(
  input: ConsumeInjectionGrantAllCoreInput,
  loaded: LoadedPolicyGrantBindings,
) {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db, sql }) => {
      const result = await new TenantInjectionGrantStore(db).tryConsumeGrantAll(
        input.organizationId,
        input.grantId,
      );
      if (!result.ok) {
        throw new InjectionGrantError(
          reasonCodeForConsumeFailure(result.reason),
          "injection grant consume denied",
        );
      }
      return recordRuntimeInjectionAuditInTenantScope(sql, {
        phase: "consume",
        outcome: "success",
        actor: auditActorForConsume(input.actor),
        organizationId: input.organizationId,
        projectId: loaded.projectId,
        environmentId: loaded.environmentId,
        grantId: input.grantId,
        ...(loaded.bindings.length > 0
          ? {
              deliveredSecretVersionIds: loaded.bindings.map((binding) => binding.secretVersionId),
            }
          : {}),
        ...(input.request !== undefined ? { request: input.request } : {}),
        ...(input.operation !== undefined ? { operation: input.operation } : {}),
      });
    },
  );
}

export async function executeConsumeInjectionGrantAll(
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

  try {
    const audit = await consumeGrantAllAndAudit(input, policyGrant);
    return { entries, auditEventId: audit.auditEventId };
  } catch (error) {
    for (const entry of entries) {
      entry.valueUtf8.unwrapUtf8().fill(0);
    }
    throw error;
  }
}

export async function consumeInjectionGrantAllWithAudit(
  input: ConsumeInjectionGrantAllCoreInput,
): Promise<ConsumeInjectionGrantAllCoreResult> {
  const loaded = await loadPolicyGrantBindings(input.organizationId, input.grantId);

  return consumeLoadedGrantWithAudit(input, loaded, () =>
    executeConsumeInjectionGrantAll(input, loaded),
  );
}
