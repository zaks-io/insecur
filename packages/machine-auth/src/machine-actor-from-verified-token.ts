import type { MachineActorRef } from "@insecur/access";
import type { VerifiedMachineAccessToken } from "./machine-access-token.js";

/** Builds the Effective Access actor from a cryptographically verified machine access token. */
export function machineActorFromVerifiedMachineAccessToken(
  token: VerifiedMachineAccessToken,
): MachineActorRef {
  return {
    type: "machine",
    machineIdentityId: token.machineIdentityId,
    tokenScope: {
      organizationId: token.organizationId,
      projectId: token.projectId,
      ...(token.environmentId !== undefined ? { environmentId: token.environmentId } : {}),
      ...(token.runtimePolicyKeyId !== undefined
        ? { runtimePolicyKeyId: token.runtimePolicyKeyId }
        : {}),
    },
    credentialScopes: token.credentialScopes,
  };
}
