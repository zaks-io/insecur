import type {
  ClearHighAssuranceChallengeRpcInput,
  CreateEnvironmentRpcInput,
  CreateProjectRpcInput,
  CreateRuntimeInjectionPolicyRpcInput,
  DenyHighAssuranceChallengeRpcInput,
  DisableRuntimeInjectionPolicyRpcInput,
  GetHighAssuranceChallengeRpcInput,
  GetRuntimeInjectionPolicyRpcInput,
  ListAuditEventsRpcInput,
  ListEnvironmentsRpcInput,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationMembersRpcInput,
  ListPendingHighAssuranceChallengesRpcInput,
  ListProjectSecretsRpcInput,
  ListProjectsRpcInput,
  ListSessionOrganizationsRpcInput,
  RevokeCliSessionRpcInput,
} from "@insecur/worker-kit";

import {
  clearHighAssuranceChallengeRpc,
  denyHighAssuranceChallengeRpc,
  getHighAssuranceChallengeRpc,
  listPendingHighAssuranceChallengesRpc,
} from "./runtime-high-assurance-rpc-delegates.js";
import {
  createEnvironmentRpc,
  listAuditEventsRpc,
  listEnvironmentsRpc,
  createProjectRpc,
  listOrganizationInvitationsRpc,
  listOrganizationMembersRpc,
  listProjectSecretsRpc,
  listProjectsRpc,
  listSessionOrganizationsRpc,
  revokeCliSessionRpc,
} from "./runtime-metadata-rpc-delegates.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";
import {
  createRuntimeInjectionPolicyRpc,
  disableRuntimeInjectionPolicyRpc,
  getRuntimeInjectionPolicyRpc,
} from "./runtime-run-policies-rpc-delegates.js";

export interface RuntimePostAuthRpcHost {
  postAuthRpc(): PostAuthRpcRunner;
}

export const RuntimeServiceDelegatedPostAuthRpc = {
  listProjects(this: RuntimePostAuthRpcHost, input: ListProjectsRpcInput) {
    return listProjectsRpc(this.postAuthRpc(), input);
  },
  createProject(this: RuntimePostAuthRpcHost, input: CreateProjectRpcInput) {
    return createProjectRpc(this.postAuthRpc(), input);
  },
  listEnvironments(this: RuntimePostAuthRpcHost, input: ListEnvironmentsRpcInput) {
    return listEnvironmentsRpc(this.postAuthRpc(), input);
  },
  createEnvironment(this: RuntimePostAuthRpcHost, input: CreateEnvironmentRpcInput) {
    return createEnvironmentRpc(this.postAuthRpc(), input);
  },
  listProjectSecrets(this: RuntimePostAuthRpcHost, input: ListProjectSecretsRpcInput) {
    return listProjectSecretsRpc(this.postAuthRpc(), input);
  },
  listSessionOrganizations(this: RuntimePostAuthRpcHost, input: ListSessionOrganizationsRpcInput) {
    return listSessionOrganizationsRpc(this.postAuthRpc(), input);
  },
  revokeCliSession(this: RuntimePostAuthRpcHost, input: RevokeCliSessionRpcInput) {
    return revokeCliSessionRpc(this.postAuthRpc(), input);
  },
  listOrganizationMembers(this: RuntimePostAuthRpcHost, input: ListOrganizationMembersRpcInput) {
    return listOrganizationMembersRpc(this.postAuthRpc(), input);
  },
  listOrganizationInvitations(
    this: RuntimePostAuthRpcHost,
    input: ListOrganizationInvitationsRpcInput,
  ) {
    return listOrganizationInvitationsRpc(this.postAuthRpc(), input);
  },
  listAuditEvents(this: RuntimePostAuthRpcHost, input: ListAuditEventsRpcInput) {
    return listAuditEventsRpc(this.postAuthRpc(), input);
  },
  listPendingHighAssuranceChallenges(
    this: RuntimePostAuthRpcHost,
    input: ListPendingHighAssuranceChallengesRpcInput,
  ) {
    return listPendingHighAssuranceChallengesRpc(this.postAuthRpc(), input);
  },
  getHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: GetHighAssuranceChallengeRpcInput,
  ) {
    return getHighAssuranceChallengeRpc(this.postAuthRpc(), input);
  },
  clearHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: ClearHighAssuranceChallengeRpcInput,
  ) {
    return clearHighAssuranceChallengeRpc(this.postAuthRpc(), input);
  },
  denyHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: DenyHighAssuranceChallengeRpcInput,
  ) {
    return denyHighAssuranceChallengeRpc(this.postAuthRpc(), input);
  },
  createRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: CreateRuntimeInjectionPolicyRpcInput,
  ) {
    return createRuntimeInjectionPolicyRpc(this.postAuthRpc(), input);
  },
  getRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: GetRuntimeInjectionPolicyRpcInput,
  ) {
    return getRuntimeInjectionPolicyRpc(this.postAuthRpc(), input);
  },
  disableRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: DisableRuntimeInjectionPolicyRpcInput,
  ) {
    return disableRuntimeInjectionPolicyRpc(this.postAuthRpc(), input);
  },
} as const;
