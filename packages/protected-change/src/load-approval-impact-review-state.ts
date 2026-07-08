import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  loadEnvironmentDeliveryImpactFacts,
  loadPromotionDraftVersionImpactFacts,
  type EnvironmentDeliveryImpactFacts,
  type PromotionDraftVersionImpactFact,
  withTenantScope,
  type PromotionDraftVersionTarget,
} from "@insecur/tenant-store";

export interface ApprovalImpactReviewState {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly draftVersions: readonly PromotionDraftVersionImpactFact[];
  readonly delivery: EnvironmentDeliveryImpactFacts;
  /** Extension point for W8 provider sync impact metadata (INS-77). */
  readonly providerSyncImpactFingerprint?: string;
}

export async function loadApprovalImpactReviewState(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly draftTargets: readonly PromotionDraftVersionTarget[];
  readonly providerSyncImpactFingerprint?: string;
}): Promise<ApprovalImpactReviewState> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const [draftVersions, delivery] = await Promise.all([
        loadPromotionDraftVersionImpactFacts(db, {
          organizationId: input.organizationId,
          targets: input.draftTargets,
        }),
        loadEnvironmentDeliveryImpactFacts(db, {
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
        }),
      ]);

      return {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        draftVersions,
        delivery,
        ...(input.providerSyncImpactFingerprint === undefined
          ? {}
          : { providerSyncImpactFingerprint: input.providerSyncImpactFingerprint }),
      };
    },
  );
}
