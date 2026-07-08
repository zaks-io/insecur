import type {
  DisplayName,
  EnvironmentId,
  InjectionGrantId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  VariableKey,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";
import type { PrincipalChainActorRead } from "./runtime-metadata-rpc-contract.js";

/** Metadata-only GitHub Actions OIDC auth method row (no credential material). */
export interface GitHubActionsOidcAuthMethodRead {
  readonly authMethodId: string;
  readonly environmentId: EnvironmentId | null;
  readonly githubRepository: string;
  readonly githubEnvironment: string | null;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
}

/** Metadata-only Environment Deploy Key auth method row (existence/metadata only; no secret material). */
export interface EnvironmentDeployKeyAuthMethodRead {
  readonly authMethodId: string;
  readonly environmentId: EnvironmentId;
  readonly status: "active" | "disabled";
  readonly nonExpiring: boolean;
  readonly expiresAt: string | null;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly createdAt: string;
}

/** Metadata-only machine identity row for the project Access read (INS-382). */
export interface ProjectMachineIdentityRead {
  readonly machineIdentityId: MachineIdentityId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
  readonly githubActionsOidcMethods: readonly GitHubActionsOidcAuthMethodRead[];
  readonly environmentDeployKeyMethods: readonly EnvironmentDeployKeyAuthMethodRead[];
}

export interface ListProjectMachineIdentitiesRpcPayload {
  readonly machineIdentities: readonly ProjectMachineIdentityRead[];
}

export interface ListProjectMachineIdentitiesRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

/** Metadata-only injection grant row for the project Access read (INS-382). */
export interface ProjectInjectionGrantRead {
  readonly grantId: InjectionGrantId;
  readonly environmentId: EnvironmentId;
  readonly variableKeys: readonly VariableKey[];
  readonly status: "active" | "consumed" | "expired" | "revoked";
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly revokedAt?: string;
  readonly revokedReason?: "tenant_suspension" | "compromise_version_invalidation";
  readonly issuedByActor?: PrincipalChainActorRead;
  readonly consumedByActor?: PrincipalChainActorRead;
}

export interface ListProjectInjectionGrantsRpcPayload {
  readonly grants: readonly ProjectInjectionGrantRead[];
}

export interface ListProjectInjectionGrantsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}
