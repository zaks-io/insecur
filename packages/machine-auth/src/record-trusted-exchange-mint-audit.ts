import type { CredentialScope } from "@insecur/access";
import type {
  EnvironmentId,
  MachineAuthMethodId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
  RuntimePolicyId,
} from "@insecur/domain";
import type { MintMachineAccessTokenResult } from "./machine-access-token.js";
import { recordMachineAccessTokenMinted } from "./record-machine-access-token-audit.js";
import type { MachineCredentialMethod } from "./machine-access-audit-metadata.js";

export async function recordTrustedExchangeMintAudit(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  credentialMethod: MachineCredentialMethod;
  credentialScopes: readonly CredentialScope[];
  minted: MintMachineAccessTokenResult;
  authMethodId?: MachineAuthMethodId;
  runtimePolicyKeyId?: RuntimePolicyId;
  request?: { requestId: RequestId };
}): Promise<void> {
  await recordMachineAccessTokenMinted({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    machineIdentityId: input.machineIdentityId,
    credentialMethod: input.credentialMethod,
    credentialScopes: input.credentialScopes,
    ...(input.authMethodId !== undefined ? { authMethodId: input.authMethodId } : {}),
    ...(input.runtimePolicyKeyId !== undefined
      ? { runtimePolicyKeyId: input.runtimePolicyKeyId }
      : {}),
    expiresAtEpoch: Math.floor(new Date(input.minted.expiresAt).getTime() / 1000),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}
