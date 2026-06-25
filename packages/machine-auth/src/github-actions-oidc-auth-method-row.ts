import type {
  EnvironmentId,
  MachineAuthMethodId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";
import type { CredentialScope } from "@insecur/access";

/** Tenant-qualified GitHub Actions OIDC auth method configuration row. */
export interface GitHubActionsOidcAuthMethodRow {
  readonly id: MachineAuthMethodId;
  readonly organizationId: OrganizationId;
  readonly machineIdentityId: MachineIdentityId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId | null;
  readonly githubRepository: string;
  readonly githubEnvironment: string | null;
  readonly oidcAudience: string;
  readonly credentialScopes: readonly CredentialScope[];
  readonly status: "active" | "disabled";
}
