import type { EffectiveAccessResult, ResourceCoordinate } from "@insecur/access";
import {
  RUNTIME_POLICY_ERROR_CODES,
  runtimePolicyId,
  runtimePolicyVersionId,
  type DisplayName,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RuntimePolicyId,
  type RuntimePolicyVersionId,
} from "@insecur/domain";
import {
  RuntimeInjectionPolicyStoreError,
  TenantRuntimeInjectionPolicyStore,
  withTenantScope,
  type RuntimeInjectionPolicyRow,
  type RuntimeInjectionPolicyVersionContentInput,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionPolicyConfigureAccess } from "./assert-runtime-injection-policy-access.js";
import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";
import { validateRuntimeInjectionPolicyBindings } from "./validate-policy-bindings.js";

type AuthorizedPolicyVersionInput = Omit<RuntimeInjectionPolicyVersionContentInput, "bindings"> & {
  secretIds: readonly string[];
  variableKeys: readonly string[];
};

export interface AuthorizedRuntimeInjectionPolicyMutationInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  policyId: RuntimePolicyId;
  policyVersionId: RuntimePolicyVersionId;
  displayName: DisplayName;
  version: AuthorizedPolicyVersionInput;
  effectiveAccess?: EffectiveAccessResult;
  accessCoordinate?: ResourceCoordinate;
}

export type CreateAuthorizedRuntimeInjectionPolicyInput =
  AuthorizedRuntimeInjectionPolicyMutationInput;
export type PublishAuthorizedRuntimeInjectionPolicyVersionInput =
  AuthorizedRuntimeInjectionPolicyMutationInput;

function mapStoreError(error: unknown): never {
  if (error instanceof RuntimeInjectionPolicyStoreError) {
    throw new RuntimeInjectionPolicyError(error.code, error.message);
  }
  throw error;
}

function toVersionContent(
  version: AuthorizedPolicyVersionInput,
): RuntimeInjectionPolicyVersionContentInput {
  const bindings = validateRuntimeInjectionPolicyBindings({
    secretIds: version.secretIds,
    variableKeys: version.variableKeys,
  });
  return {
    command: version.command,
    ...(version.commandFingerprint !== undefined
      ? { commandFingerprint: version.commandFingerprint }
      : {}),
    ttlSeconds: version.ttlSeconds,
    deliveryMode: version.deliveryMode,
    bindings,
  };
}

async function executeAuthorizedPolicyMutation(
  input: AuthorizedRuntimeInjectionPolicyMutationInput,
  mutate: (
    store: TenantRuntimeInjectionPolicyStore,
    version: RuntimeInjectionPolicyVersionContentInput,
  ) => Promise<RuntimeInjectionPolicyRow>,
) {
  assertRuntimeInjectionPolicyConfigureAccess(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
    input.effectiveAccess,
    input.accessCoordinate,
  );

  const version = toVersionContent(input.version);

  try {
    return await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) => {
        const store = new TenantRuntimeInjectionPolicyStore(db);
        const policy = await mutate(store, version);
        const activeVersion = await store.getActiveVersion(input.organizationId, input.policyId);
        if (!activeVersion) {
          throw new Error("runtime injection policy version missing after mutation");
        }
        return { policy, activeVersion };
      },
    );
  } catch (error) {
    mapStoreError(error);
  }
}

export async function createAuthorizedRuntimeInjectionPolicy(
  input: CreateAuthorizedRuntimeInjectionPolicyInput,
) {
  return executeAuthorizedPolicyMutation(input, (store, version) =>
    store.createPolicy({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      policyId: input.policyId,
      policyVersionId: input.policyVersionId,
      displayName: input.displayName,
      version,
    }),
  );
}

export async function publishAuthorizedRuntimeInjectionPolicyVersion(
  input: PublishAuthorizedRuntimeInjectionPolicyVersionInput,
) {
  return executeAuthorizedPolicyMutation(input, (store, version) =>
    store.publishVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      policyId: input.policyId,
      policyVersionId: input.policyVersionId,
      displayName: input.displayName,
      version,
    }),
  );
}

async function withPolicyStore<T>(
  organizationIdValue: OrganizationId,
  run: (store: TenantRuntimeInjectionPolicyStore) => Promise<T>,
): Promise<T> {
  return withTenantScope(
    { kind: "organization", organizationId: organizationIdValue },
    async ({ db }) => run(new TenantRuntimeInjectionPolicyStore(db)),
  );
}

export async function getRuntimeInjectionPolicyVersion(
  organizationIdValue: OrganizationId,
  policyIdValue: RuntimePolicyId,
  policyVersionIdValue: RuntimePolicyVersionId,
) {
  return withPolicyStore(organizationIdValue, (store) =>
    store.getVersionById(organizationIdValue, policyIdValue, policyVersionIdValue),
  );
}

export async function getRuntimeInjectionPolicyActiveVersion(
  organizationIdValue: OrganizationId,
  policyIdValue: RuntimePolicyId,
) {
  return withPolicyStore(organizationIdValue, (store) =>
    store.getActiveVersion(organizationIdValue, policyIdValue),
  );
}

export function assertPolicyVersionReferenceable(
  policyIdValue: RuntimePolicyId,
  policyVersionIdValue: RuntimePolicyVersionId,
  version: { policyId: RuntimePolicyId; policyVersionId: RuntimePolicyVersionId },
): void {
  if (version.policyId !== policyIdValue || version.policyVersionId !== policyVersionIdValue) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.notFound,
      "runtime injection policy version reference does not match policy",
    );
  }
}

export { runtimePolicyId, runtimePolicyVersionId };
