import type {
  EnvironmentId,
  MachineAuthMethodId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
} from "@insecur/domain";
import type { CredentialScope } from "@insecur/access";
import type { DeployKeySecretVerifierMaterial } from "./deploy-key-secret.js";

/** Tenant-qualified Environment Deploy Key auth method configuration row. */
export interface EnvironmentDeployKeyAuthMethodRow {
  readonly id: MachineAuthMethodId;
  readonly organizationId: OrganizationId;
  readonly machineIdentityId: MachineIdentityId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly runtimePolicyKeyIds: readonly RuntimePolicyId[];
  readonly credentialScopes: readonly CredentialScope[];
  readonly secretVerifier: DeployKeySecretVerifierMaterial;
  readonly status: "active" | "disabled";
  readonly expiresAt: Date | string | null;
  readonly nonExpiring: boolean;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly createdAt: Date | string;
}
