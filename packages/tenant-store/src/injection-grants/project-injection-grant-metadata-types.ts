import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  VariableKey,
} from "@insecur/domain";

import type { PrincipalChainActorRow } from "../secrets/principal-chain-actor-types.js";

export interface ListProjectInjectionGrantsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

export type InjectionGrantLifecycleStatus = "active" | "consumed" | "expired" | "revoked";

export interface ProjectInjectionGrantRow {
  readonly grantId: InjectionGrantId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly variableKeys: readonly VariableKey[];
  readonly status: InjectionGrantLifecycleStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: "tenant_suspension" | "compromise_version_invalidation" | null;
  readonly issuedByActor?: PrincipalChainActorRow;
  readonly consumedByActor?: PrincipalChainActorRow;
}
