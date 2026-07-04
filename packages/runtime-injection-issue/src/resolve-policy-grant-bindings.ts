import {
  INJECTION_ERROR_CODES,
  RUNTIME_POLICY_ERROR_CODES,
  type RuntimePolicyId,
  type RuntimePolicyVersionId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import {
  TenantRuntimeInjectionPolicyStore,
  type ResolvedInjectionGrantBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import { resolveBindingForSelector } from "./resolve-single-grant-binding.js";

export interface ResolvedPolicyGrantBindings {
  bindings: readonly ResolvedInjectionGrantBinding[];
  policyId: RuntimePolicyId;
  policyVersionId: RuntimePolicyVersionId;
  ttlSeconds: number;
}

interface ActivePolicyVersion {
  policyId: RuntimePolicyId;
  policyVersionId: RuntimePolicyVersionId;
  ttlSeconds: number;
  secretIds: readonly SecretId[];
  variableKeys: readonly VariableKey[];
}

async function loadActivePolicyVersion(
  policyStore: TenantRuntimeInjectionPolicyStore,
  coordinate: GrantCoordinate,
  policyId: RuntimePolicyId,
): Promise<ActivePolicyVersion> {
  const policy = await policyStore.getPolicyById(coordinate.organizationId, policyId);
  if (policy === null) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "runtime injection policy coordinate mismatch",
    );
  }
  if (
    policy.projectId !== coordinate.projectId ||
    policy.environmentId !== coordinate.environmentId
  ) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "runtime injection policy coordinate mismatch",
    );
  }
  if (policy.disabledAt !== null) {
    throw new InjectionGrantError(
      RUNTIME_POLICY_ERROR_CODES.disabled,
      "runtime injection policy is disabled",
    );
  }
  if (policy.activeVersionId === null) {
    throw new InjectionGrantError(
      RUNTIME_POLICY_ERROR_CODES.notFound,
      "runtime injection policy has no active version",
    );
  }
  const version = await policyStore.getVersionById(
    coordinate.organizationId,
    policyId,
    policy.activeVersionId,
  );
  if (version === null) {
    throw new InjectionGrantError(
      RUNTIME_POLICY_ERROR_CODES.notFound,
      "runtime injection policy version not found",
    );
  }
  return version;
}

async function collectPolicyBindings(
  coordinate: GrantCoordinate,
  version: ActivePolicyVersion,
): Promise<ResolvedInjectionGrantBinding[]> {
  const bindings: ResolvedInjectionGrantBinding[] = [];
  const seenSecretIds = new Set<string>();

  for (const boundSecretId of version.secretIds) {
    if (seenSecretIds.has(boundSecretId)) {
      continue;
    }
    seenSecretIds.add(boundSecretId);
    bindings.push(
      await resolveBindingForSelector(coordinate, {
        kind: "secret_id",
        secretId: boundSecretId,
      }),
    );
  }

  for (const boundVariableKey of version.variableKeys) {
    const binding = await resolveBindingForSelector(coordinate, {
      kind: "variable_key",
      variableKey: boundVariableKey,
    });
    if (!seenSecretIds.has(binding.secretId)) {
      seenSecretIds.add(binding.secretId);
      bindings.push(binding);
    }
  }

  if (bindings.length === 0) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "runtime injection policy has no resolvable bindings",
    );
  }

  return bindings;
}

export async function resolveInjectionGrantPolicyBindings(
  coordinate: GrantCoordinate,
  policyId: RuntimePolicyId,
): Promise<ResolvedPolicyGrantBindings> {
  return withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async ({ db }) => {
      const policyStore = new TenantRuntimeInjectionPolicyStore(db);
      const version = await loadActivePolicyVersion(policyStore, coordinate, policyId);
      const bindings = await collectPolicyBindings(coordinate, version);
      return {
        bindings,
        policyId: version.policyId,
        policyVersionId: version.policyVersionId,
        ttlSeconds: version.ttlSeconds,
      };
    },
  );
}

export async function resolveInjectionGrantBindings(
  coordinate: GrantCoordinate,
  selector: InjectionGrantIssueSelector,
): Promise<
  | { kind: "single"; binding: ResolvedInjectionGrantBinding }
  | { kind: "policy"; resolved: ResolvedPolicyGrantBindings }
> {
  if (selector.kind === "policy_id") {
    const resolved = await resolveInjectionGrantPolicyBindings(coordinate, selector.policyId);
    return { kind: "policy", resolved };
  }
  const binding = await resolveBindingForSelector(coordinate, selector);
  return { kind: "single", binding };
}
