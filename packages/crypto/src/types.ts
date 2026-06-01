import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";

/** Identity binding for ciphertext (Opaque Resource IDs only). */
export interface SecretCiphertextIdentity {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
}
