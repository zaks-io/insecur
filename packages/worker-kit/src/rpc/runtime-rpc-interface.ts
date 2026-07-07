import type {
  AcceptInvitationResult,
  CreateInvitationResult,
  CreateOperatorOrganizationResult,
  ProvisionGuidedOrganizationResult,
} from "@insecur/onboarding";
import type { OperationPollResult } from "@insecur/operations";
import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import type {
  BootstrapStatus,
  CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import type {
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
} from "./runtime-delivery-rpc-contract.js";
import type {
  ListAuditEventsRpcInput,
  ListAuditEventsRpcPayload,
} from "./runtime-audit-rpc-contract.js";
import type {
  CreateEnvironmentRpcInput,
  CreateEnvironmentRpcPayload,
  CreateProjectRpcInput,
  CreateProjectRpcPayload,
  ListEnvironmentsRpcInput,
  ListEnvironmentsRpcPayload,
  ListEnvironmentSecretsRpcInput,
  ListEnvironmentSecretsRpcPayload,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationInvitationsRpcPayload,
  ListOrganizationMembersRpcInput,
  ListOrganizationMembersRpcPayload,
  ListProjectSecretsRpcInput,
  ListProjectSecretsRpcPayload,
  ListProjectsRpcInput,
  ListProjectsRpcPayload,
  ListSecretVersionsRpcInput,
  ListSecretVersionsRpcPayload,
  ListSessionOrganizationsRpcInput,
  ListSessionOrganizationsRpcPayload,
} from "./runtime-metadata-rpc-contract.js";
import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
} from "./runtime-operations-rpc-contract.js";
import type {
  FirstValueUsageStatusRpcPayload,
  QueryFirstValueUsageRpcInput,
} from "./runtime-first-value-usage-rpc-contract.js";
import type {
  ClearHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcPayload,
  DenyHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcPayload,
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
} from "./runtime-high-assurance-rpc-contract.js";
import type {
  CreateWebhookSubscriptionRpcInput,
  CreateWebhookSubscriptionRpcPayload,
  DeleteWebhookSubscriptionRpcInput,
  DeleteWebhookSubscriptionRpcPayload,
  ListWebhookEventCodesRpcInput,
  ListWebhookEventCodesRpcPayload,
  ListWebhookSubscriptionsRpcInput,
  ListWebhookSubscriptionsRpcPayload,
  RotateWebhookSigningSecretRpcInput,
  RotateWebhookSigningSecretRpcPayload,
  UpdateWebhookSubscriptionRpcInput,
  UpdateWebhookSubscriptionRpcPayload,
} from "./runtime-webhook-rpc-contract.js";
import type {
  AcceptInvitationRpcInput,
  CancelOperationRpcInput,
  CancelOperationRpcPayload,
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  GetBootstrapStatusRpcInput,
  GetOperationRpcInput,
  IsCliSessionRevokedRpcInput,
  IsCliSessionRevokedRpcPayload,
  IssueInjectionGrantRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RevokeCliSessionRpcInput,
  RevokeCliSessionRpcPayload,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "./runtime-rpc-contract.js";

/**
 * The interface the API Worker binds against. The implementation
 * (`RuntimeService extends WorkerEntrypoint`) lives in `apps/runtime`; the API never imports it,
 * it only calls `c.env.RUNTIME.<method>(...)` typed by this contract.
 */
export interface RuntimeRpc {
  consumeGrant(input: ConsumeGrantRpcInput): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>>;
  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>>;
  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>>;

  // Pre-auth (no hop token; trusted by the private Service Binding boundary).
  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>>;
  recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>>;
  recordAbuseDenied(
    input: RecordAbuseDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>>;
  getBootstrapStatus(input: GetBootstrapStatusRpcInput): Promise<RuntimeRpcResult<BootstrapStatus>>;
  isCliSessionRevoked(
    input: IsCliSessionRevokedRpcInput,
  ): Promise<RuntimeRpcResult<IsCliSessionRevokedRpcPayload>>;

  // Post-auth (carry a scoped hop token; the Runtime rebuilds the actor).
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
  getOperation(input: GetOperationRpcInput): Promise<RuntimeRpcResult<OperationPollResult>>;
  cancelOperation(
    input: CancelOperationRpcInput,
  ): Promise<RuntimeRpcResult<CancelOperationRpcPayload>>;
  issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>>;
  completeBootstrapOperatorClaim(
    input: CompleteBootstrapClaimRpcInput,
  ): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>>;
  recordInjectionRunCompleted(
    input: RecordInjectionRunCompletedRpcInput,
  ): Promise<RuntimeRpcResult<RecordInjectionRunCompletedRpcPayload>>;
  captureFirstValueFeedback(
    input: CaptureFirstValueFeedbackRpcInput,
  ): Promise<RuntimeRpcResult<CaptureFirstValueFeedbackRpcPayload>>;
  listProjects(input: ListProjectsRpcInput): Promise<RuntimeRpcResult<ListProjectsRpcPayload>>;
  createProject(input: CreateProjectRpcInput): Promise<RuntimeRpcResult<CreateProjectRpcPayload>>;
  listEnvironments(
    input: ListEnvironmentsRpcInput,
  ): Promise<RuntimeRpcResult<ListEnvironmentsRpcPayload>>;
  createEnvironment(
    input: CreateEnvironmentRpcInput,
  ): Promise<RuntimeRpcResult<CreateEnvironmentRpcPayload>>;
  listProjectSecrets(
    input: ListProjectSecretsRpcInput,
  ): Promise<RuntimeRpcResult<ListProjectSecretsRpcPayload>>;
  listEnvironmentSecrets(
    input: ListEnvironmentSecretsRpcInput,
  ): Promise<RuntimeRpcResult<ListEnvironmentSecretsRpcPayload>>;
  listSecretVersions(
    input: ListSecretVersionsRpcInput,
  ): Promise<RuntimeRpcResult<ListSecretVersionsRpcPayload>>;
  listSessionOrganizations(
    input: ListSessionOrganizationsRpcInput,
  ): Promise<RuntimeRpcResult<ListSessionOrganizationsRpcPayload>>;
  revokeCliSession(
    input: RevokeCliSessionRpcInput,
  ): Promise<RuntimeRpcResult<RevokeCliSessionRpcPayload>>;
  listOrganizationMembers(
    input: ListOrganizationMembersRpcInput,
  ): Promise<RuntimeRpcResult<ListOrganizationMembersRpcPayload>>;
  listOrganizationInvitations(
    input: ListOrganizationInvitationsRpcInput,
  ): Promise<RuntimeRpcResult<ListOrganizationInvitationsRpcPayload>>;
  listAuditEvents(
    input: ListAuditEventsRpcInput,
  ): Promise<RuntimeRpcResult<ListAuditEventsRpcPayload>>;
  queryFirstValueUsage(
    input: QueryFirstValueUsageRpcInput,
  ): Promise<RuntimeRpcResult<FirstValueUsageStatusRpcPayload>>;
  listPendingHighAssuranceChallenges(
    input: ListPendingHighAssuranceChallengesRpcInput,
  ): Promise<RuntimeRpcResult<ListPendingHighAssuranceChallengesRpcPayload>>;
  getHighAssuranceChallenge(
    input: GetHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<GetHighAssuranceChallengeRpcPayload>>;
  clearHighAssuranceChallenge(
    input: ClearHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<ClearHighAssuranceChallengeRpcPayload>>;
  denyHighAssuranceChallenge(
    input: DenyHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<DenyHighAssuranceChallengeRpcPayload>>;
  createWebhookSubscription(
    input: CreateWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<CreateWebhookSubscriptionRpcPayload>>;
  listWebhookSubscriptions(
    input: ListWebhookSubscriptionsRpcInput,
  ): Promise<RuntimeRpcResult<ListWebhookSubscriptionsRpcPayload>>;
  updateWebhookSubscription(
    input: UpdateWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<UpdateWebhookSubscriptionRpcPayload>>;
  deleteWebhookSubscription(
    input: DeleteWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<DeleteWebhookSubscriptionRpcPayload>>;
  rotateWebhookSigningSecret(
    input: RotateWebhookSigningSecretRpcInput,
  ): Promise<RuntimeRpcResult<RotateWebhookSigningSecretRpcPayload>>;
  listWebhookEventCodes(
    input: ListWebhookEventCodesRpcInput,
  ): Promise<RuntimeRpcResult<ListWebhookEventCodesRpcPayload>>;
}
