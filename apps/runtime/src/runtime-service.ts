import { WorkerEntrypoint, type env as cloudflareEnv } from "cloudflare:workers";
import { cloudflareSentryOptions } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import type {
  AcceptInvitationRpcInput,
  CancelOperationRpcInput,
  CaptureFirstValueFeedbackRpcInput,
  ClearHighAssuranceChallengeRpcInput,
  CreateEnvironmentRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  CreateProjectRpcInput,
  CreateWebhookSubscriptionRpcInput,
  DeleteWebhookSubscriptionRpcInput,
  DenyHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcInput,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ListAuditEventsRpcInput,
  ListEnvironmentSecretsRpcInput,
  ListEnvironmentsRpcInput,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationMembersRpcInput,
  ListPendingHighAssuranceChallengesRpcInput,
  ListProjectSecretsRpcInput,
  ListProjectsRpcInput,
  ListSecretVersionsRpcInput,
  ListSessionOrganizationsRpcInput,
  ListWebhookEventCodesRpcInput,
  ListWebhookSubscriptionsRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RecordInjectionRunCompletedRpcInput,
  RevokeCliSessionRpcInput,
  RotateWebhookSigningSecretRpcInput,
  RuntimeRpcResult,
  UpdateWebhookSubscriptionRpcInput,
} from "@insecur/worker-kit";

import {
  clearHighAssuranceChallengeRpc,
  denyHighAssuranceChallengeRpc,
  getHighAssuranceChallengeRpc,
  listPendingHighAssuranceChallengesRpc,
} from "./rpc/runtime-high-assurance-rpc-delegates.js";
import {
  captureFirstValueFeedbackRpc,
  cancelOperationRpc,
  createEnvironmentRpc,
  createProjectRpc,
  getOperationRpc,
  issueInjectionGrantRpc,
  listAuditEventsRpc,
  listEnvironmentSecretsRpc,
  listEnvironmentsRpc,
  listOrganizationInvitationsRpc,
  listOrganizationMembersRpc,
  listProjectSecretsRpc,
  listProjectsRpc,
  listSecretVersionsRpc,
  listSessionOrganizationsRpc,
  recordInjectionRunCompletedRpc,
  revokeCliSessionRpc,
} from "./rpc/runtime-metadata-rpc-delegates.js";
import {
  acceptInvitationRpc,
  createInvitationRpc,
  createOperatorOrganizationRpc,
  provisionGuidedOrganizationRpc,
} from "./rpc/runtime-onboarding-rpc-delegates.js";
import {
  createWebhookSubscriptionRpc,
  deleteWebhookSubscriptionRpc,
  listWebhookEventCodesRpc,
  listWebhookSubscriptionsRpc,
  rotateWebhookSigningSecretRpc,
  updateWebhookSubscriptionRpc,
} from "./rpc/runtime-webhook-rpc-delegates.js";
import { RuntimeServiceCore } from "./runtime-service-core.js";
import type { RuntimeEnv } from "./env.js";

type SentryRuntimeServiceConstructor = new (
  ctx: ExecutionContext,
  env: typeof cloudflareEnv,
) => WorkerEntrypoint<RuntimeEnv>;

/**
 * Post-auth metadata and webhook RPC surface for the Runtime Worker (ADR-0077).
 * Keyring-bound and pre-auth methods live on {@link RuntimeServiceCore}.
 */
class RuntimeServiceBase extends RuntimeServiceCore {
  provisionGuidedOrganization(input: ProvisionGuidedOrganizationRpcInput) {
    return provisionGuidedOrganizationRpc(this.bindPostAuth(), input);
  }

  createOperatorOrganization(input: CreateOperatorOrganizationRpcInput) {
    return createOperatorOrganizationRpc(this.bindPostAuth(), input);
  }

  createInvitation(input: CreateInvitationRpcInput) {
    return createInvitationRpc(this.bindPostAuth(), input);
  }

  acceptInvitation(input: AcceptInvitationRpcInput) {
    return acceptInvitationRpc(this.bindPostAuth(), input);
  }

  getOperation(input: GetOperationRpcInput) {
    return getOperationRpc(this.bindPostAuth(), input);
  }

  cancelOperation(input: CancelOperationRpcInput) {
    return cancelOperationRpc(this.bindPostAuth(), input);
  }

  issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>> {
    return issueInjectionGrantRpc(this.bindPostAuth(), input);
  }

  recordInjectionRunCompleted(input: RecordInjectionRunCompletedRpcInput) {
    return recordInjectionRunCompletedRpc(this.bindPostAuth(), input);
  }

  captureFirstValueFeedback(input: CaptureFirstValueFeedbackRpcInput) {
    return captureFirstValueFeedbackRpc(this.bindPostAuth(), input);
  }

  listProjects(input: ListProjectsRpcInput) {
    return listProjectsRpc(this.bindPostAuth(), input);
  }

  createProject(input: CreateProjectRpcInput) {
    return createProjectRpc(this.bindPostAuth(), input);
  }

  listEnvironments(input: ListEnvironmentsRpcInput) {
    return listEnvironmentsRpc(this.bindPostAuth(), input);
  }

  createEnvironment(input: CreateEnvironmentRpcInput) {
    return createEnvironmentRpc(this.bindPostAuth(), input);
  }

  listProjectSecrets(input: ListProjectSecretsRpcInput) {
    return listProjectSecretsRpc(this.bindPostAuth(), input);
  }

  listEnvironmentSecrets(input: ListEnvironmentSecretsRpcInput) {
    return listEnvironmentSecretsRpc(this.bindPostAuth(), input);
  }

  listSecretVersions(input: ListSecretVersionsRpcInput) {
    return listSecretVersionsRpc(this.bindPostAuth(), input);
  }

  listSessionOrganizations(input: ListSessionOrganizationsRpcInput) {
    return listSessionOrganizationsRpc(this.bindPostAuth(), input);
  }

  revokeCliSession(input: RevokeCliSessionRpcInput) {
    return revokeCliSessionRpc(this.bindPostAuth(), input);
  }

  listOrganizationMembers(input: ListOrganizationMembersRpcInput) {
    return listOrganizationMembersRpc(this.bindPostAuth(), input);
  }

  listOrganizationInvitations(input: ListOrganizationInvitationsRpcInput) {
    return listOrganizationInvitationsRpc(this.bindPostAuth(), input);
  }

  listAuditEvents(input: ListAuditEventsRpcInput) {
    return listAuditEventsRpc(this.bindPostAuth(), input);
  }

  listPendingHighAssuranceChallenges(input: ListPendingHighAssuranceChallengesRpcInput) {
    return listPendingHighAssuranceChallengesRpc(this.bindPostAuth(), input);
  }

  getHighAssuranceChallenge(input: GetHighAssuranceChallengeRpcInput) {
    return getHighAssuranceChallengeRpc(this.bindPostAuth(), input);
  }

  clearHighAssuranceChallenge(input: ClearHighAssuranceChallengeRpcInput) {
    return clearHighAssuranceChallengeRpc(this.bindPostAuth(), input);
  }

  denyHighAssuranceChallenge(input: DenyHighAssuranceChallengeRpcInput) {
    return denyHighAssuranceChallengeRpc(this.bindPostAuth(), input);
  }

  createWebhookSubscription(input: CreateWebhookSubscriptionRpcInput) {
    return createWebhookSubscriptionRpc(this.bindPostAuth(), this.env, input);
  }

  listWebhookSubscriptions(input: ListWebhookSubscriptionsRpcInput) {
    return listWebhookSubscriptionsRpc(this.bindPostAuth(), this.env, input);
  }

  updateWebhookSubscription(input: UpdateWebhookSubscriptionRpcInput) {
    return updateWebhookSubscriptionRpc(this.bindPostAuth(), this.env, input);
  }

  deleteWebhookSubscription(input: DeleteWebhookSubscriptionRpcInput) {
    return deleteWebhookSubscriptionRpc(this.bindPostAuth(), this.env, input);
  }

  rotateWebhookSigningSecret(input: RotateWebhookSigningSecretRpcInput) {
    return rotateWebhookSigningSecretRpc(this.bindPostAuth(), this.env, input);
  }

  listWebhookEventCodes(input: ListWebhookEventCodesRpcInput) {
    return listWebhookEventCodesRpc(this.bindPostAuth(), this.env, input);
  }
}

export const RuntimeService = Sentry.withSentry<
  RuntimeEnv,
  unknown,
  unknown,
  SentryRuntimeServiceConstructor
>(cloudflareSentryOptions, RuntimeServiceBase as unknown as SentryRuntimeServiceConstructor);
