import { WorkerEntrypoint, type env as cloudflareEnv } from "cloudflare:workers";
import { cloudflareSentryOptions } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import {
  completeBootstrapOperatorClaim,
  getBootstrapStatus,
  type BootstrapStatus,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import { resolveAdmittedUserId, runWithRuntimeConnection } from "@insecur/tenant-store";
import type {
  AcceptInvitationRpcInput,
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  GetBootstrapStatusRpcInput,
  CancelOperationRpcInput,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  CreateEnvironmentRpcInput,
  CreateProjectRpcInput,
  ListAuditEventsRpcInput,
  ListEnvironmentsRpcInput,
  ListOrganizationInvitationsRpcInput,
  ListPendingHighAssuranceChallengesRpcInput,
  GetHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcInput,
  ListOrganizationMembersRpcInput,
  ListProjectSecretsRpcInput,
  ListProjectsRpcInput,
  ListSessionOrganizationsRpcInput,
  ResolveSessionWhoamiRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  CaptureFirstValueFeedbackRpcInput,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RevokeCliSessionRpcInput,
  IsCliSessionRevokedRpcInput,
  IsCliSessionRevokedRpcPayload,
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import { consumeGrantAllOperation } from "./operations/consume-grant-all-operation.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { recordAdmissionDeniedOperation } from "./operations/record-admission-denied-operation.js";
import { recordAbuseDeniedOperation } from "./operations/record-abuse-denied-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import {
  clearHighAssuranceChallengeRpc,
  denyHighAssuranceChallengeRpc,
  getHighAssuranceChallengeRpc,
  listPendingHighAssuranceChallengesRpc,
} from "./rpc/runtime-high-assurance-rpc-delegates.js";
import {
  captureFirstValueFeedbackRpc,
  cancelOperationRpc,
  getOperationRpc,
  issueInjectionGrantRpc,
  createEnvironmentRpc,
  listAuditEventsRpc,
  listEnvironmentsRpc,
  createProjectRpc,
  listOrganizationInvitationsRpc,
  listOrganizationMembersRpc,
  listProjectSecretsRpc,
  listProjectsRpc,
  listSessionOrganizationsRpc,
  resolveSessionWhoamiRpc,
  recordInjectionRunCompletedRpc,
  revokeCliSessionRpc,
} from "./rpc/runtime-metadata-rpc-delegates.js";
import { isCliSessionRevokedOperation } from "./operations/revoke-cli-session-operation.js";
import {
  acceptInvitationRpc,
  createInvitationRpc,
  createOperatorOrganizationRpc,
  provisionGuidedOrganizationRpc,
} from "./rpc/runtime-onboarding-rpc-delegates.js";
import { withRuntimeRpcEntry, type RuntimeRpcActorContext } from "./rpc/runtime-rpc-entry.js";
import { withRuntimeRpcUnauthEntry } from "./rpc/runtime-rpc-unauthenticated-entry.js";

type SentryRuntimeServiceConstructor = new (
  ctx: ExecutionContext,
  env: typeof cloudflareEnv,
) => WorkerEntrypoint<RuntimeEnv>;

/**
 * The decrypt-egress deep module (ADR-0077). This is the only deploy that holds
 * `INSTANCE_ROOT_KEY_V1`, so it is the only place ciphertext becomes plaintext. The API Worker
 * reaches it over a private Service Binding and can name nothing crypto-shaped; it passes IDs plus a
 * scoped hop token and gets back a structured result.
 *
 * Authorization and decryption are one indivisible call: the package functions run the single
 * resolver internally before they touch the keyring, so there is no "decrypt without authorize"
 * path to split across the seam. Errors are returned as data, not thrown, because RPC does not
 * propagate custom error properties (`code`/`retryable`) - the API re-throws a shaped error.
 *
 * Each public method is one RPC binding: it picks a trust shape (`#post` verifies the hop token and
 * derives the actor views; `#pre` runs token-less, trusted by the private binding) and runs one
 * operation. Operations carrying real logic (write, consume, operation-read, denied-audit) keep
 * their own files; the rest map the RPC input straight onto the owning package function inline.
 */
class RuntimeServiceBase extends WorkerEntrypoint<RuntimeEnv> {
  /**
   * Run one RPC inside a request-scoped DB connection (ADR-0077). The Hyperdrive connection string
   * lives only on `env.DB.connectionString` (never `process.env`), so the Worker opens a per-request
   * `postgres.js` client here via `runWithRuntimeConnection` and hands the socket `end()` to
   * `ctx.waitUntil` so teardown never blocks the response. A client is never shared across RPC
   * invocations — that is what cancels cross-request-context promises and collapsed to `auth.invalid`.
   *
   * When no Hyperdrive binding is present (the in-process fake binding used by the fast test layer,
   * built with a `DB`-less env), the work runs directly and the store falls back to its Node pool
   * (`DATABASE_URL_RUNTIME`); single Node context, no cross-request hazard.
   */
  async #withConnection<T>(run: () => Promise<T>): Promise<T> {
    const connStr = this.env.DB?.connectionString;
    if (!connStr) {
      return run();
    }
    const { result, closing } = await runWithRuntimeConnection(connStr, run);
    this.ctx.waitUntil(closing);
    return result;
  }

  /**
   * Post-auth RPC pipeline: request-scoped connection, hop-token verification + actor derivation,
   * and the structured error envelope. The handler receives the verified actor views and returns
   * the method payload.
   */
  #post<T>(
    actorToken: string,
    run: (actors: RuntimeRpcActorContext) => Promise<T>,
  ): Promise<RuntimeRpcResult<T>> {
    return this.#withConnection(() => withRuntimeRpcEntry({ env: this.env, actorToken }, run));
  }

  /**
   * Pre-auth RPC pipeline: request-scoped connection and the same error envelope, but no hop-token
   * verification — these methods run before an authenticated actor exists and are trusted by the
   * private Service Binding boundary itself (zero public routes, no keyring, identity/metadata only).
   */
  #pre<T>(run: () => Promise<T>): Promise<RuntimeRpcResult<T>> {
    return this.#withConnection(() => withRuntimeRpcUnauthEntry(run));
  }

  // --- Keyring-bound methods (decrypt happens here; real-logic operations) ---

  consumeGrant(input: ConsumeGrantRpcInput): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
    return this.#post(input.actorToken, ({ auditActor }) =>
      consumeGrantOperation({ env: this.env, input, auditActor }),
    );
  }

  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>> {
    return this.#post(input.actorToken, ({ auditActor }) =>
      consumeGrantAllOperation({ env: this.env, input, auditActor }),
    );
  }

  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return this.#post(input.actorToken, ({ auditActor, accessActor }) =>
      writeSecretOperation({ env: this.env, input, auditActor, accessActor }),
    );
  }

  // --- Pre-auth identity/metadata methods (no hop token; trusted by the private binding) ---

  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>> {
    return this.#pre(async () => ({
      userId: await resolveAdmittedUserId(input.instanceId, input.workosUserId),
    }));
  }

  recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>> {
    return this.#pre(() => recordAdmissionDeniedOperation(input));
  }

  recordAbuseDenied(
    input: RecordAbuseDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>> {
    return this.#pre(() => recordAbuseDeniedOperation(input));
  }

  getBootstrapStatus(
    input: GetBootstrapStatusRpcInput,
  ): Promise<RuntimeRpcResult<BootstrapStatus>> {
    return this.#pre(() => getBootstrapStatus(input.instanceId));
  }

  isCliSessionRevoked(
    input: IsCliSessionRevokedRpcInput,
  ): Promise<RuntimeRpcResult<IsCliSessionRevokedRpcPayload>> {
    return this.#pre(() => isCliSessionRevokedOperation(input));
  }

  // --- Post-auth non-keyring DB methods (carry a scoped hop token) ---

  provisionGuidedOrganization(input: ProvisionGuidedOrganizationRpcInput) {
    return provisionGuidedOrganizationRpc(this.#post.bind(this), input);
  }

  createOperatorOrganization(input: CreateOperatorOrganizationRpcInput) {
    return createOperatorOrganizationRpc(this.#post.bind(this), input);
  }

  createInvitation(input: CreateInvitationRpcInput) {
    return createInvitationRpc(this.#post.bind(this), input);
  }

  acceptInvitation(input: AcceptInvitationRpcInput) {
    return acceptInvitationRpc(this.#post.bind(this), input);
  }
  getOperation(input: GetOperationRpcInput) {
    return getOperationRpc(this.#post.bind(this), input);
  }

  cancelOperation(input: CancelOperationRpcInput) {
    return cancelOperationRpc(this.#post.bind(this), input);
  }

  issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>> {
    return issueInjectionGrantRpc(this.#post.bind(this), input);
  }

  completeBootstrapOperatorClaim(
    input: CompleteBootstrapClaimRpcInput,
  ): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>> {
    return this.#post(input.actorToken, ({ actor }) =>
      completeBootstrapOperatorClaim({
        instanceId: input.instanceId,
        actor,
        bootstrapSecret: input.bootstrapSecret,
        operatorGrantId: input.operatorGrantId,
        ownerMembershipId: input.ownerMembershipId,
        request: { requestId: input.requestId },
      }),
    );
  }

  recordInjectionRunCompleted(input: RecordInjectionRunCompletedRpcInput) {
    return recordInjectionRunCompletedRpc(this.#post.bind(this), input);
  }

  captureFirstValueFeedback(input: CaptureFirstValueFeedbackRpcInput) {
    return captureFirstValueFeedbackRpc(this.#post.bind(this), input);
  }

  listProjects(input: ListProjectsRpcInput) {
    return listProjectsRpc(this.#post.bind(this), input);
  }

  createProject(input: CreateProjectRpcInput) {
    return createProjectRpc(this.#post.bind(this), input);
  }

  listEnvironments(input: ListEnvironmentsRpcInput) {
    return listEnvironmentsRpc(this.#post.bind(this), input);
  }

  createEnvironment(input: CreateEnvironmentRpcInput) {
    return createEnvironmentRpc(this.#post.bind(this), input);
  }

  listProjectSecrets(input: ListProjectSecretsRpcInput) {
    return listProjectSecretsRpc(this.#post.bind(this), input);
  }

  listSessionOrganizations(input: ListSessionOrganizationsRpcInput) {
    return listSessionOrganizationsRpc(this.#post.bind(this), input);
  }

  revokeCliSession(input: RevokeCliSessionRpcInput) {
    return revokeCliSessionRpc(this.#post.bind(this), input);
  }

  resolveSessionWhoami(input: ResolveSessionWhoamiRpcInput) {
    return resolveSessionWhoamiRpc(this.#post.bind(this), input);
  }

  listOrganizationMembers(input: ListOrganizationMembersRpcInput) {
    return listOrganizationMembersRpc(this.#post.bind(this), input);
  }

  listOrganizationInvitations(input: ListOrganizationInvitationsRpcInput) {
    return listOrganizationInvitationsRpc(this.#post.bind(this), input);
  }

  listAuditEvents(input: ListAuditEventsRpcInput) {
    return listAuditEventsRpc(this.#post.bind(this), input);
  }

  listPendingHighAssuranceChallenges(input: ListPendingHighAssuranceChallengesRpcInput) {
    return listPendingHighAssuranceChallengesRpc(this.#post.bind(this), input);
  }

  getHighAssuranceChallenge(input: GetHighAssuranceChallengeRpcInput) {
    return getHighAssuranceChallengeRpc(this.#post.bind(this), input);
  }

  clearHighAssuranceChallenge(input: ClearHighAssuranceChallengeRpcInput) {
    return clearHighAssuranceChallengeRpc(this.#post.bind(this), input);
  }

  denyHighAssuranceChallenge(input: DenyHighAssuranceChallengeRpcInput) {
    return denyHighAssuranceChallengeRpc(this.#post.bind(this), input);
  }
}

export const RuntimeService = Sentry.withSentry<
  RuntimeEnv,
  unknown,
  unknown,
  SentryRuntimeServiceConstructor
>(cloudflareSentryOptions, RuntimeServiceBase as unknown as SentryRuntimeServiceConstructor);
