import type {
  ClearHighAssuranceChallengeRpcInput,
  CreateEnvironmentRpcInput,
  CreateProjectRpcInput,
  CreateRuntimeInjectionPolicyRpcInput,
  CreateWebhookSubscriptionRpcInput,
  DeleteWebhookSubscriptionRpcInput,
  DenyHighAssuranceChallengeRpcInput,
  DisableRuntimeInjectionPolicyRpcInput,
  ExportTenantAuditRpcInput,
  GetHighAssuranceChallengeRpcInput,
  GetRuntimeInjectionPolicyRpcInput,
  ListAuditEventsRpcInput,
  ListEnvironmentsRpcInput,
  ListEnvironmentSecretsRpcInput,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationMembersRpcInput,
  ListPendingHighAssuranceChallengesRpcInput,
  ListProjectSecretsRpcInput,
  ListProjectsRpcInput,
  ListSecretVersionsRpcInput,
  ListSessionOrganizationsRpcInput,
  ListWebhookEventCodesRpcInput,
  ListWebhookSubscriptionsRpcInput,
  RevokeCliSessionRpcInput,
  RotateWebhookSigningSecretRpcInput,
  UpdateWebhookSubscriptionRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "../env.js";

import {
  clearHighAssuranceChallengeRpc,
  denyHighAssuranceChallengeRpc,
  getHighAssuranceChallengeRpc,
  listPendingHighAssuranceChallengesRpc,
} from "./runtime-high-assurance-rpc-delegates.js";
import {
  createEnvironmentRpc,
  exportTenantAuditRpc,
  listAuditEventsRpc,
  listEnvironmentsRpc,
  listEnvironmentSecretsRpc,
  createProjectRpc,
  listOrganizationInvitationsRpc,
  listOrganizationMembersRpc,
  listProjectSecretsRpc,
  listSecretVersionsRpc,
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
import {
  createWebhookSubscriptionRpc,
  deleteWebhookSubscriptionRpc,
  listWebhookEventCodesRpc,
  listWebhookSubscriptionsRpc,
  rotateWebhookSigningSecretRpc,
  updateWebhookSubscriptionRpc,
} from "./runtime-webhook-rpc-delegates.js";

export interface RuntimePostAuthRpcHost {
  postAuthRpc(): PostAuthRpcRunner;
  readonly env: RuntimeEnv;
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
  listEnvironmentSecrets(this: RuntimePostAuthRpcHost, input: ListEnvironmentSecretsRpcInput) {
    return listEnvironmentSecretsRpc(this.postAuthRpc(), input);
  },
  listSecretVersions(this: RuntimePostAuthRpcHost, input: ListSecretVersionsRpcInput) {
    return listSecretVersionsRpc(this.postAuthRpc(), input);
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
  exportTenantAudit(this: RuntimePostAuthRpcHost, input: ExportTenantAuditRpcInput) {
    return exportTenantAuditRpc(this.postAuthRpc(), this.env, input);
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
  createWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: CreateWebhookSubscriptionRpcInput,
  ) {
    return createWebhookSubscriptionRpc(this.postAuthRpc(), this.env, input);
  },
  listWebhookSubscriptions(this: RuntimePostAuthRpcHost, input: ListWebhookSubscriptionsRpcInput) {
    return listWebhookSubscriptionsRpc(this.postAuthRpc(), this.env, input);
  },
  updateWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: UpdateWebhookSubscriptionRpcInput,
  ) {
    return updateWebhookSubscriptionRpc(this.postAuthRpc(), this.env, input);
  },
  deleteWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: DeleteWebhookSubscriptionRpcInput,
  ) {
    return deleteWebhookSubscriptionRpc(this.postAuthRpc(), this.env, input);
  },
  rotateWebhookSigningSecret(
    this: RuntimePostAuthRpcHost,
    input: RotateWebhookSigningSecretRpcInput,
  ) {
    return rotateWebhookSigningSecretRpc(this.postAuthRpc(), this.env, input);
  },
  listWebhookEventCodes(this: RuntimePostAuthRpcHost, input: ListWebhookEventCodesRpcInput) {
    return listWebhookEventCodesRpc(this.postAuthRpc(), this.env, input);
  },
} as const;
