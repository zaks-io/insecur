import { WorkerEntrypoint, type env as cloudflareEnv } from "cloudflare:workers";
import { cloudflareSentryOptions } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import {
  completeBootstrapOperatorClaim,
  type BootstrapStatus,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import { runWithRuntimeConnection } from "@insecur/tenant-store";
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
  IsCliSessionRevokedRpcInput,
  IsCliSessionRevokedRpcPayload,
  IssueInjectionGrantRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  QueryFirstValueUsageRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  CaptureFirstValueFeedbackRpcInput,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import {
  consumeGrantAllRpc,
  consumeGrantRpc,
  writeSecretRpc,
} from "./rpc/runtime-keyring-rpc-delegates.js";
import {
  captureFirstValueFeedbackRpc,
  queryFirstValueUsageRpc,
  cancelOperationRpc,
  getOperationRpc,
  issueInjectionGrantRpc,
  recordInjectionRunCompletedRpc,
} from "./rpc/runtime-metadata-rpc-delegates.js";
import { isCliSessionRevokedOperation } from "./operations/revoke-cli-session-operation.js";
import {
  getBootstrapStatusRpc,
  recordAbuseDeniedRpc,
  recordAdmissionDeniedRpc,
  resolveAdmissionRpc,
} from "./rpc/runtime-pre-auth-rpc-delegates.js";
import {
  acceptInvitationRpc,
  createInvitationRpc,
  createOperatorOrganizationRpc,
  provisionGuidedOrganizationRpc,
} from "./rpc/runtime-onboarding-rpc-delegates.js";
import { RuntimeServiceDelegatedPostAuthRpc } from "./rpc/runtime-service-delegated-post-auth-rpc.js";
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

  postAuthRpc() {
    return this.#post.bind(this);
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
    return consumeGrantRpc(this.#post.bind(this), this.env, input);
  }

  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>> {
    return consumeGrantAllRpc(this.#post.bind(this), this.env, input);
  }

  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return writeSecretRpc(this.#post.bind(this), this.env, input);
  }

  // --- Pre-auth identity/metadata methods (no hop token; trusted by the private binding) ---

  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>> {
    return resolveAdmissionRpc(this.#pre.bind(this), input);
  }

  recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>> {
    return recordAdmissionDeniedRpc(this.#pre.bind(this), input);
  }

  recordAbuseDenied(
    input: RecordAbuseDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>> {
    return recordAbuseDeniedRpc(this.#pre.bind(this), input);
  }

  getBootstrapStatus(
    input: GetBootstrapStatusRpcInput,
  ): Promise<RuntimeRpcResult<BootstrapStatus>> {
    return getBootstrapStatusRpc(this.#pre.bind(this), input);
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
    return captureFirstValueFeedbackRpc(this.postAuthRpc(), input);
  }

  queryFirstValueUsage(input: QueryFirstValueUsageRpcInput) {
    return queryFirstValueUsageRpc(this.#post.bind(this), input);
  }
}

Object.assign(RuntimeServiceBase.prototype, RuntimeServiceDelegatedPostAuthRpc);

export const RuntimeService = Sentry.withSentry<
  RuntimeEnv,
  unknown,
  unknown,
  SentryRuntimeServiceConstructor
>(cloudflareSentryOptions, RuntimeServiceBase as unknown as SentryRuntimeServiceConstructor);
