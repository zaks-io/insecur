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
}): string {
  const parts = [
    input.organizationId,
    input.projectId,
    input.environmentId,
    ...stableSort(input.draftVersionIds),
    ...(input.secretIds === undefined ? [] : stableSort(input.secretIds)),
  ];
  return `sha256:${parts.join("|")}`;
}
