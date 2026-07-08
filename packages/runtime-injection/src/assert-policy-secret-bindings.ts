import {
  RUNTIME_POLICY_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  resolveSecretForPolicyBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";

export interface AssertPolicySecretBindingsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretIds: readonly SecretId[];
}

function mapSecretBindingError(error: unknown): never {
  if (error instanceof SecretVersionStoreNotFoundError) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.secretBindingNotFound,
      "runtime injection policy secret binding not found in policy scope",
    );
  }
  if (error instanceof SecretVersionStoreConflictError) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.secretBindingEnvironmentMismatch,
      "runtime injection policy secret binding belongs to a different environment",
    );
  }
  throw error;
}

/** Ensures each bound secret ID exists in the policy's organization, project, and environment. */
export async function assertPolicySecretBindingsExist(
  input: AssertPolicySecretBindingsInput,
): Promise<void> {
  if (input.secretIds.length === 0) {
    return;
  }

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      for (const boundSecretId of input.secretIds) {
        try {
          await resolveSecretForPolicyBinding(db, {
            organizationId: input.organizationId,
            projectId: input.projectId,
            environmentId: input.environmentId,
            secretId: boundSecretId,
          });
        } catch (error) {
          mapSecretBindingError(error);
        }
      }
    },
  );
}
