import { APPROVAL_ERROR_CODES, type OrganizationId, type SecretVersionId } from "@insecur/domain";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  TenantSecretVersionStore,
  withTenantScope,
  type PromotionDraftVersionTarget,
} from "@insecur/tenant-store";

export async function validatePromotionDraftTargets(input: {
  readonly organizationId: OrganizationId;
  readonly draftVersionIds: readonly SecretVersionId[];
}): Promise<readonly PromotionDraftVersionTarget[]> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const versionStore = new TenantSecretVersionStore(db);
      const targets: PromotionDraftVersionTarget[] = [];
      for (const draftVersionIdValue of input.draftVersionIds) {
        const version = await versionStore.getVersionInOrganization(
          input.organizationId,
          draftVersionIdValue,
        );
        if (version?.lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.draft) {
          throw Object.assign(new Error("Draft version not found for promotion."), {
            code: APPROVAL_ERROR_CODES.invalidDraftSelection,
          });
        }
        targets.push({
          secretId: version.secretId,
          secretVersionId: draftVersionIdValue,
        });
      }
      return targets;
    },
  );
}
