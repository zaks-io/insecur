import {
  acceptInvitation,
  createInvitation,
  createOperatorOrganization,
  provisionGuidedOrganization,
  type AcceptInvitationResult,
  type CreateInvitationResult,
  type CreateOperatorOrganizationResult,
  type ProvisionGuidedOrganizationResult,
} from "@insecur/onboarding";
import type {
  AcceptInvitationRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function provisionGuidedOrganizationRpc(
  post: PostAuthRpcRunner,
  input: ProvisionGuidedOrganizationRpcInput,
): Promise<RuntimeRpcResult<ProvisionGuidedOrganizationResult>> {
  return post(input.actorToken, ({ actor }) =>
    provisionGuidedOrganization({
      userId: actor.userId,
      instanceId: input.instanceId,
      // The hop token only mints for an already-admitted, resolved actor.
      isAdmitted: true,
      ...(input.organizationDisplayName !== undefined
        ? { organizationDisplayName: input.organizationDisplayName }
        : {}),
      ...(input.projectDisplayName !== undefined
        ? { projectDisplayName: input.projectDisplayName }
        : {}),
      ...(input.teamDisplayName !== undefined ? { teamDisplayName: input.teamDisplayName } : {}),
      ...(input.environmentDisplayName !== undefined
        ? { environmentDisplayName: input.environmentDisplayName }
        : {}),
      ...(input.resourceIds !== undefined ? { resourceIds: input.resourceIds } : {}),
      request: { requestId: input.requestId },
    }),
  );
}

export function createOperatorOrganizationRpc(
  post: PostAuthRpcRunner,
  input: CreateOperatorOrganizationRpcInput,
): Promise<RuntimeRpcResult<CreateOperatorOrganizationResult>> {
  return post(input.actorToken, ({ actor }) =>
    createOperatorOrganization({
      instanceId: input.instanceId,
      operatorUserId: actor.userId,
      ...(input.organizationDisplayName !== undefined
        ? { organizationDisplayName: input.organizationDisplayName }
        : {}),
      ...(input.teamDisplayName !== undefined ? { teamDisplayName: input.teamDisplayName } : {}),
      ...(input.resourceIds !== undefined ? { resourceIds: input.resourceIds } : {}),
      request: { requestId: input.requestId },
    }),
  );
}

export function createInvitationRpc(
  post: PostAuthRpcRunner,
  input: CreateInvitationRpcInput,
): Promise<RuntimeRpcResult<CreateInvitationResult>> {
  return post(input.actorToken, ({ actor }) =>
    createInvitation({
      actor: { type: "user", userId: actor.userId },
      organizationId: input.organizationId,
      inviteeUserId: input.inviteeUserId,
      rolePreset: input.rolePreset,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.invitationId !== undefined ? { invitationId: input.invitationId } : {}),
      ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
      request: { requestId: input.requestId },
    }),
  );
}

export function acceptInvitationRpc(
  post: PostAuthRpcRunner,
  input: AcceptInvitationRpcInput,
): Promise<RuntimeRpcResult<AcceptInvitationResult>> {
  return post(input.actorToken, ({ actor }) =>
    acceptInvitation({
      invitationId: input.invitationId,
      organizationId: input.organizationId,
      acceptingUserId: actor.userId,
      ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
      request: { requestId: input.requestId },
    }),
  );
}
