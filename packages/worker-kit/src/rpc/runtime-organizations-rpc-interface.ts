import type {
  AcceptInvitationResult,
  CreateInvitationResult,
  CreateOperatorOrganizationResult,
  ProvisionGuidedOrganizationResult,
} from "@insecur/onboarding";
import type {
  ListOrganizationInvitationsRpcInput,
  ListOrganizationInvitationsRpcPayload,
  ListOrganizationMembersRpcInput,
  ListOrganizationMembersRpcPayload,
  ListSessionOrganizationsRpcInput,
  ListSessionOrganizationsRpcPayload,
} from "./runtime-metadata-rpc-contract.js";
import type {
  AcceptInvitationRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RuntimeRpcResult,
} from "./runtime-rpc-contract.js";

export interface RuntimeOrganizationsRpc {
  provisionGuidedOrganization(
    input: ProvisionGuidedOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<ProvisionGuidedOrganizationResult>>;
  createOperatorOrganization(
    input: CreateOperatorOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<CreateOperatorOrganizationResult>>;
  createInvitation(
    input: CreateInvitationRpcInput,
  ): Promise<RuntimeRpcResult<CreateInvitationResult>>;
  acceptInvitation(
    input: AcceptInvitationRpcInput,
  ): Promise<RuntimeRpcResult<AcceptInvitationResult>>;
  listSessionOrganizations(
    input: ListSessionOrganizationsRpcInput,
  ): Promise<RuntimeRpcResult<ListSessionOrganizationsRpcPayload>>;
  listOrganizationMembers(
    input: ListOrganizationMembersRpcInput,
  ): Promise<RuntimeRpcResult<ListOrganizationMembersRpcPayload>>;
  listOrganizationInvitations(
    input: ListOrganizationInvitationsRpcInput,
  ): Promise<RuntimeRpcResult<ListOrganizationInvitationsRpcPayload>>;
}
