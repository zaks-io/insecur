import type {
  DisplayName,
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";

export interface ListProjectMachineIdentitiesInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

export interface GitHubActionsOidcAuthMethodRow {
  readonly authMethodId: string;
  readonly machineIdentityId: MachineIdentityId;
  readonly environmentId: EnvironmentId | null;
  readonly githubRepository: string;
  readonly githubEnvironment: string | null;
  readonly status: "active" | "disabled";
  readonly createdAt: Date;
}

export interface EnvironmentDeployKeyAuthMethodRow {
  readonly authMethodId: string;
  readonly machineIdentityId: MachineIdentityId;
  readonly environmentId: EnvironmentId;
  readonly status: "active" | "disabled";
  readonly nonExpiring: boolean;
  readonly expiresAt: Date | null;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly createdAt: Date;
}

export interface ProjectMachineIdentityRow {
  readonly machineIdentityId: MachineIdentityId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly status: "active" | "disabled";
  readonly createdAt: Date;
  readonly githubActionsOidcMethods: readonly GitHubActionsOidcAuthMethodRow[];
  readonly environmentDeployKeyMethods: readonly EnvironmentDeployKeyAuthMethodRow[];
}
