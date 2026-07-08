import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
} from "@insecur/domain";

function stableSort(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

/** Metadata-only fingerprint for Approval Impact Review (INS-85). */
export function computeImpactReviewFingerprint(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly secretIds?: readonly SecretId[];
  /** Extension point for W8 provider sync impact metadata (INS-77); omitted in V1 core review. */
  readonly providerSyncImpactFingerprint?: string;
}): string {
  const parts = [
    input.organizationId,
    input.projectId,
    input.environmentId,
    ...stableSort(input.draftVersionIds),
    ...(input.secretIds === undefined ? [] : stableSort(input.secretIds)),
    ...(input.providerSyncImpactFingerprint === undefined
      ? []
      : [input.providerSyncImpactFingerprint]),
  ];
  return `sha256:${parts.join("|")}`;
}
