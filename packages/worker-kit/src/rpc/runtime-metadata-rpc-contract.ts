import type {
  DisplayName,
  EnvironmentId,
  EnvironmentLifecycleStage,
  InvitationId,
  MachineIdentityId,
  MembershipId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  UserId,
  VariableKey,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

/** Metadata-only organization row for the session memberships read (no slugs). */
export interface SessionOrganizationRead {
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
}

/**
 * The distinct Organizations the verified actor holds at least one Membership in, for the console
 * org switcher and default-org resolution (INS-367). A self-read: it is keyed solely by the
 * hop-token actor, so it needs no organization input and leaks nothing across tenants.
 */
export interface ListSessionOrganizationsRpcPayload {
  readonly organizations: readonly SessionOrganizationRead[];
}

export type ListSessionOrganizationsRpcInput = PostAuthRpcInputBase;

/** Metadata-only project row for list reads (no slugs). */
export interface ProjectMetadataRead {
  readonly projectId: ProjectId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly createdAt: string;
}

export interface ListProjectsRpcPayload {
  readonly projects: readonly ProjectMetadataRead[];
}

export interface ListProjectsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

export interface CreateProjectRpcPayload {
  readonly projectId: ProjectId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly createdAt: string;
}

export interface CreateProjectRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly displayName: DisplayName;
}

/** Metadata-only environment row for list reads (includes protection flag). */
export interface EnvironmentMetadataRead {
  readonly environmentId: EnvironmentId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly displayName: DisplayName;
  readonly lifecycleStage: EnvironmentLifecycleStage;
  readonly isProtected: boolean;
  readonly createdAt: string;
}

export interface ListEnvironmentsRpcPayload {
  readonly environments: readonly EnvironmentMetadataRead[];
}

export interface ListEnvironmentsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

export interface CreateEnvironmentRpcPayload {
  readonly environmentId: EnvironmentId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly displayName: DisplayName;
  readonly lifecycleStage: EnvironmentLifecycleStage;
  readonly isProtected: boolean;
  readonly createdAt: string;
  readonly copiedShapeCount: number;
}

export interface CreateEnvironmentRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly displayName: DisplayName;
  readonly copyShapesFromEnvironmentId?: EnvironmentId;
}

/** Metadata-only actor reference for matrix last-set cells. */
export interface SecretMatrixLastSetActorRead {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: UserId;
  readonly machineIdentityId?: MachineIdentityId;
}

/** One secret × environment matrix cell (metadata only; no values or ciphertext). */
export interface SecretMatrixCellRead {
  readonly environmentId: EnvironmentId;
  readonly present: boolean;
  readonly secretId?: SecretId;
  readonly versionNumber?: number;
  readonly secretVersionId?: SecretVersionId;
  readonly lifecycleState?: "draft" | "live" | "retained" | "discarded";
  readonly lastSetAt?: string;
  readonly lastSetActor?: SecretMatrixLastSetActorRead;
}

/** Matrix row keyed by Variable Key with one cell per project environment column. */
export interface SecretMatrixRowRead {
  readonly variableKey: VariableKey;
  readonly cells: readonly SecretMatrixCellRead[];
}

/**
 * Secrets × environments matrix metadata for the console headline view (INS-363). Columns carry
 * protection flags; cells expose presence, current version, and last-set actor/time only.
 */
export interface ListProjectSecretsRpcPayload {
  readonly environments: readonly EnvironmentMetadataRead[];
  readonly rows: readonly SecretMatrixRowRead[];
}

export interface ListProjectSecretsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

/** Metadata-only current-version pointer for one environment-scoped Secret Shape. */
export interface EnvironmentSecretCurrentVersionRead {
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: "draft" | "live" | "retained" | "discarded";
  readonly createdAt: string;
  readonly publishedAt?: string;
}

/** One Secret Shape row in a single Environment (metadata only; no values or ciphertext). */
export interface EnvironmentSecretRead {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly displayName: DisplayName;
  readonly currentVersion?: EnvironmentSecretCurrentVersionRead;
  readonly createdAt: string;
}

export interface ListEnvironmentSecretsRpcPayload {
  readonly secrets: readonly EnvironmentSecretRead[];
}

export interface ListEnvironmentSecretsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

/** Metadata-only Secret Version row for the versions read (no values or ciphertext). */
export interface SecretVersionMetadataRead {
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: "draft" | "live" | "retained" | "discarded";
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly isCurrent: boolean;
  readonly isPublished: boolean;
}

export interface ListSecretVersionsRpcPayload {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly versions: readonly SecretVersionMetadataRead[];
}

export interface ListSecretVersionsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
}

/**
 * Metadata-only membership row for the org People read (INS-373). `displayName` comes from the
 * member's user admission and is null when none was recorded; `projectId` is null for
 * organization-tier memberships. No emails, no auth material.
 */
export interface OrganizationMemberRead {
  readonly membershipId: MembershipId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly displayName: DisplayName | null;
  readonly rolePreset: string;
  readonly projectId: ProjectId | null;
  readonly createdAt: string;
}

export interface ListOrganizationMembersRpcPayload {
  readonly members: readonly OrganizationMemberRead[];
}

export interface ListOrganizationMembersRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

/**
 * Metadata-only pending invitation row (INS-373). Invitees are already-admitted users, so an
 * invitation carries no token or acceptance secret anywhere in the model — this envelope exposes
 * identifiers, the role bundle, status, and timestamps only.
 */
export interface OrganizationInvitationRead {
  readonly invitationId: InvitationId;
  readonly organizationId: OrganizationId;
  readonly inviteeUserId: UserId;
  readonly inviteeDisplayName: DisplayName | null;
  readonly rolePreset: string;
  readonly status: "pending";
  readonly projectId: ProjectId | null;
  readonly createdAt: string;
}

export interface ListOrganizationInvitationsRpcPayload {
  readonly invitations: readonly OrganizationInvitationRead[];
}

export interface ListOrganizationInvitationsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}
