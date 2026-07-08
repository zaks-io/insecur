import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

import type { SecretVersionLifecycleState } from "./lifecycle-states.js";
import type { PrincipalChainActorRow } from "./principal-chain-actor-types.js";

export interface SecretVersionDescriptiveVerdictsRead {
  readonly valueByteLength: number;
  readonly encodingClass: "utf-8" | "hex-shaped" | "base64-shaped";
  readonly isEmpty: boolean;
  readonly hasLeadingOrTrailingWhitespace: boolean;
  readonly looksLikePlaceholder: boolean;
  readonly secretShapeMatchVerdict: "matches" | "does_not_match" | "no_shape_rule";
}

export interface ListEnvironmentSecretsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

export interface EnvironmentSecretMetadataRow {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly createdAt: Date;
  readonly currentVersionId: SecretVersionId | null;
  readonly currentVersionNumber: number | null;
  readonly currentLifecycleState: SecretVersionLifecycleState | null;
  readonly currentVersionCreatedAt: Date | null;
  readonly currentPublishedAt: Date | null;
  readonly currentVersionDescriptiveVerdicts: SecretVersionDescriptiveVerdictsRead | null;
}

export interface ListSecretVersionMetadataInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
}

export interface SecretVersionMetadataRow {
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: SecretVersionLifecycleState;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly isCurrent: boolean;
  readonly isPublished: boolean;
  readonly descriptiveVerdicts: SecretVersionDescriptiveVerdictsRead;
  readonly setAt?: Date;
  readonly setActor?: PrincipalChainActorRow;
}
