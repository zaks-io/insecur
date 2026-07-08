import {
  APPROVAL_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type SecretVersionId,
} from "@insecur/domain";
import {
  TenantSecretVersionStore,
  withTenantScope,
  type PromotionDraftVersionTarget,
} from "@insecur/tenant-store";

/**
 * Validates that every requested Draft Version ID is a live Draft that belongs to the
 * promotion's target Protected Environment. Any version that is missing, not a Draft, or
 * whose secret lives in a different Environment is rejected with `invalid_draft_selection`
 * (ADR-0017: exact Draft Version IDs in one Protected Environment, no cross-env smuggling).
 */
export async function validatePromotionDraftTargets(input: {
  readonly organizationId: OrganizationId;
  readonly environmentId: EnvironmentId;
  readonly draftVersionIds: readonly SecretVersionId[];
}): Promise<readonly PromotionDraftVersionTarget[]> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const versionStore = new TenantSecretVersionStore(db);
      const targets: PromotionDraftVersionTarget[] = [];
      for (const draftVersionIdValue of input.draftVersionIds) {
        const target = await versionStore.getDraftPromotionTargetInEnvironment({
          organizationId: input.organizationId,
          environmentId: input.environmentId,
          secretVersionId: draftVersionIdValue,
        });
        if (target === null) {
          throw Object.assign(
            new Error("Draft version is not a promotable draft in the target environment."),
            { code: APPROVAL_ERROR_CODES.invalidDraftSelection },
          );
        }
        targets.push({
          secretId: target.secretId,
          secretVersionId: target.secretVersionId,
        });
      }
      return targets;
    },
  );
}
