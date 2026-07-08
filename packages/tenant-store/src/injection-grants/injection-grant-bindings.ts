import {
  environmentId,
  injectionGrantId,
  projectId,
  secretId,
  secretVersionId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";

import type {
  ConsumedInjectionGrantRow,
  InjectionGrantConsumeFailure,
  InjectionGrantRow,
} from "./types.js";

export function isPolicyBackedGrant(grant: InjectionGrantRow): boolean {
  return grant.policy_id !== null;
}

export function getBoundGrants(grant: InjectionGrantRow): ConsumedInjectionGrantRow[] | null {
  if (
    grant.secret_ids.length !== grant.variable_keys.length ||
    grant.secret_ids.length !== grant.secret_version_ids.length ||
    grant.secret_ids.length === 0
  ) {
    return null;
  }
  const bindings: ConsumedInjectionGrantRow[] = [];
  for (let index = 0; index < grant.secret_ids.length; index += 1) {
    const boundSecretId = grant.secret_ids[index];
    const boundVariableKey = grant.variable_keys[index];
    const boundVersionId = grant.secret_version_ids[index];
    if (
      boundSecretId === undefined ||
      boundVariableKey === undefined ||
      boundVersionId === undefined
    ) {
      return null;
    }
    bindings.push({
      grantId: injectionGrantId.brand(grant.id),
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
      secretId: secretId.brand(boundSecretId),
      secretVersionId: secretVersionId.brand(boundVersionId),
      variableKey: boundVariableKey as VariableKey,
    });
  }
  return bindings;
}

export function getBoundGrant(grant: InjectionGrantRow): ConsumedInjectionGrantRow | null {
  if (isPolicyBackedGrant(grant)) {
    return null;
  }
  const bindings = getBoundGrants(grant);
  if (bindings?.length !== 1) {
    return null;
  }
  return bindings[0] ?? null;
}

function classifyGrantTerminalFailure(
  grant: InjectionGrantRow,
): Exclude<
  InjectionGrantConsumeFailure,
  "not_found" | "binding_not_allowed" | "consume_mode_mismatch"
> | null {
  if (grant.consumed_at !== null) {
    return "already_consumed";
  }
  if (grant.revoked_at !== null) {
    return "revoked";
  }
  if (grant.expires_at.getTime() <= Date.now()) {
    return "expired";
  }
  return null;
}

export function classifyConsumeFailure(
  grant: InjectionGrantRow | null,
  requestedSecretId: SecretId,
  requestedVariableKey: VariableKey,
): InjectionGrantConsumeFailure | null {
  if (!grant) {
    return "not_found";
  }
  if (isPolicyBackedGrant(grant)) {
    return "consume_mode_mismatch";
  }
  const bound = getBoundGrant(grant);
  if (!bound) {
    return "not_found";
  }
  if (bound.secretId !== requestedSecretId || bound.variableKey !== requestedVariableKey) {
    return "binding_not_allowed";
  }
  return classifyGrantTerminalFailure(grant);
}

export function classifyConsumeAllFailure(
  grant: InjectionGrantRow | null,
): InjectionGrantConsumeFailure | null {
  if (!grant) {
    return "not_found";
  }
  if (!isPolicyBackedGrant(grant)) {
    return "consume_mode_mismatch";
  }
  if (getBoundGrants(grant) === null) {
    return "not_found";
  }
  return classifyGrantTerminalFailure(grant);
}
