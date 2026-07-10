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
  ListProjectInjectionGrantsRpcInput,
  ListProjectMachineIdentitiesRpcInput,
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
import type {
  CreateAppConnectionRpcInput,
  DisconnectAppConnectionRpcInput,
  GetAppConnectionStatusRpcInput,
  ListAppConnectionsRpcInput,
  ReauthAppConnectionRpcInput,
  RotateAppConnectionCredentialRpcInput,
} from "@insecur/worker-kit/rpc/runtime-connections-rpc-contract";

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
import {
  listProjectInjectionGrantsRpc,
  listProjectMachineIdentitiesRpc,
} from "./runtime-project-access-rpc-delegates.js";
import {
  createAppConnectionRpc,
  disconnectAppConnectionRpc,
  getAppConnectionStatusRpc,
  listAppConnectionsRpc,
  reauthAppConnectionRpc,
  rotateAppConnectionCredentialRpc,
} from "./runtime-connections-rpc-delegates.js";
import {
  createRuntimeInjectionPolicyRpc,
  disableRuntimeInjectionPolicyRpc,
  getRuntimeInjectionPolicyRpc,
} from "./runtime-run-policies-rpc-delegates.js";
import {
  RUNTIME_POST_AUTH_RPC,
  type RuntimePostAuthRpcHost,
} from "./runtime-service-delegated-post-auth-rpc-host.js";
import { RuntimeServiceProtectedChangePostAuthRpc } from "./runtime-service-protected-change-post-auth-rpc.js";
import {
  createWebhookSubscriptionRpc,
  deleteWebhookSubscriptionRpc,
  listWebhookEventCodesRpc,
  listWebhookSubscriptionsRpc,
  rotateWebhookSigningSecretRpc,
  updateWebhookSubscriptionRpc,
} from "./runtime-webhook-rpc-delegates.js";

export type { RuntimePostAuthRpcHost } from "./runtime-service-delegated-post-auth-rpc-host.js";

export const RuntimeServiceDelegatedPostAuthRpc = {
  ...RuntimeServiceProtectedChangePostAuthRpc,
  listProjects(this: RuntimePostAuthRpcHost, input: ListProjectsRpcInput) {
    return listProjectsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  createProject(this: RuntimePostAuthRpcHost, input: CreateProjectRpcInput) {
    return createProjectRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listEnvironments(this: RuntimePostAuthRpcHost, input: ListEnvironmentsRpcInput) {
    return listEnvironmentsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  createEnvironment(this: RuntimePostAuthRpcHost, input: CreateEnvironmentRpcInput) {
    return createEnvironmentRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listProjectSecrets(this: RuntimePostAuthRpcHost, input: ListProjectSecretsRpcInput) {
    return listProjectSecretsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listProjectMachineIdentities(
    this: RuntimePostAuthRpcHost,
    input: ListProjectMachineIdentitiesRpcInput,
  ) {
    return listProjectMachineIdentitiesRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listProjectInjectionGrants(
    this: RuntimePostAuthRpcHost,
    input: ListProjectInjectionGrantsRpcInput,
  ) {
    return listProjectInjectionGrantsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listEnvironmentSecrets(this: RuntimePostAuthRpcHost, input: ListEnvironmentSecretsRpcInput) {
    return listEnvironmentSecretsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listSecretVersions(this: RuntimePostAuthRpcHost, input: ListSecretVersionsRpcInput) {
    return listSecretVersionsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listSessionOrganizations(this: RuntimePostAuthRpcHost, input: ListSessionOrganizationsRpcInput) {
    return listSessionOrganizationsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  revokeCliSession(this: RuntimePostAuthRpcHost, input: RevokeCliSessionRpcInput) {
    return revokeCliSessionRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listOrganizationMembers(this: RuntimePostAuthRpcHost, input: ListOrganizationMembersRpcInput) {
    return listOrganizationMembersRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listOrganizationInvitations(
    this: RuntimePostAuthRpcHost,
    input: ListOrganizationInvitationsRpcInput,
  ) {
    return listOrganizationInvitationsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listAuditEvents(this: RuntimePostAuthRpcHost, input: ListAuditEventsRpcInput) {
    return listAuditEventsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  exportTenantAudit(this: RuntimePostAuthRpcHost, input: ExportTenantAuditRpcInput) {
    return exportTenantAuditRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  listPendingHighAssuranceChallenges(
    this: RuntimePostAuthRpcHost,
    input: ListPendingHighAssuranceChallengesRpcInput,
  ) {
    return listPendingHighAssuranceChallengesRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  getHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: GetHighAssuranceChallengeRpcInput,
  ) {
    return getHighAssuranceChallengeRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  clearHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: ClearHighAssuranceChallengeRpcInput,
  ) {
    return clearHighAssuranceChallengeRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  denyHighAssuranceChallenge(
    this: RuntimePostAuthRpcHost,
    input: DenyHighAssuranceChallengeRpcInput,
  ) {
    return denyHighAssuranceChallengeRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  createRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: CreateRuntimeInjectionPolicyRpcInput,
  ) {
    return createRuntimeInjectionPolicyRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  getRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: GetRuntimeInjectionPolicyRpcInput,
  ) {
    return getRuntimeInjectionPolicyRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  disableRuntimeInjectionPolicy(
    this: RuntimePostAuthRpcHost,
    input: DisableRuntimeInjectionPolicyRpcInput,
  ) {
    return disableRuntimeInjectionPolicyRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  createWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: CreateWebhookSubscriptionRpcInput,
  ) {
    return createWebhookSubscriptionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  listWebhookSubscriptions(this: RuntimePostAuthRpcHost, input: ListWebhookSubscriptionsRpcInput) {
    return listWebhookSubscriptionsRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  updateWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: UpdateWebhookSubscriptionRpcInput,
  ) {
    return updateWebhookSubscriptionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  deleteWebhookSubscription(
    this: RuntimePostAuthRpcHost,
    input: DeleteWebhookSubscriptionRpcInput,
  ) {
    return deleteWebhookSubscriptionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  rotateWebhookSigningSecret(
    this: RuntimePostAuthRpcHost,
    input: RotateWebhookSigningSecretRpcInput,
  ) {
    return rotateWebhookSigningSecretRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  listWebhookEventCodes(this: RuntimePostAuthRpcHost, input: ListWebhookEventCodesRpcInput) {
    return listWebhookEventCodesRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  listAppConnections(this: RuntimePostAuthRpcHost, input: ListAppConnectionsRpcInput) {
    return listAppConnectionsRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  getAppConnectionStatus(this: RuntimePostAuthRpcHost, input: GetAppConnectionStatusRpcInput) {
    return getAppConnectionStatusRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  createAppConnection(this: RuntimePostAuthRpcHost, input: CreateAppConnectionRpcInput) {
    return createAppConnectionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  rotateAppConnectionCredential(
    this: RuntimePostAuthRpcHost,
    input: RotateAppConnectionCredentialRpcInput,
  ) {
    return rotateAppConnectionCredentialRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  reauthAppConnection(this: RuntimePostAuthRpcHost, input: ReauthAppConnectionRpcInput) {
    return reauthAppConnectionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
  disconnectAppConnection(this: RuntimePostAuthRpcHost, input: DisconnectAppConnectionRpcInput) {
    return disconnectAppConnectionRpc(this[RUNTIME_POST_AUTH_RPC](), this.env, input);
  },
} as const;
