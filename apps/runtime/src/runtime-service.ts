import { WorkerEntrypoint, type env as cloudflareEnv } from "cloudflare:workers";
import { cloudflareSentryOptions } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import {
  revokeInjectionGrantsForCompromiseVersion,
  revokeInjectionGrantsForTenantSuspension,
  type RevokeInjectionGrantsForCompromiseVersionResult,
  type RevokeInjectionGrantsForTenantSuspensionResult,
} from "@insecur/runtime-injection";
import { getBootstrapStatus, type BootstrapStatus } from "@insecur/instance-bootstrap";
import { resolveAdmissionForEdge, runWithRuntimeConnection } from "@insecur/tenant-store";
import type { RequestId } from "@insecur/domain";
import type {
  AcceptInvitationRpcInput,
  CheckSecretPossessionPayload,
  CheckSecretPossessionRpcInput,
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  GetBootstrapStatusRpcInput,
  CancelOperationRpcInput,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  QueryFirstValueUsageRpcInput,
  ResolveSessionWhoamiRpcInput,
  RegisterAgentSessionRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordDeviceAuthorizationAuditRpcInput,
  RecordDeviceAuthorizationAuditRpcPayload,
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
import { maybeRuntimeConnectionString } from "./env.js";
import { ensureAuditNotificationEmitterRegistered } from "./notifications/runtime-notification-registration.js";
import { instrumentRuntimeSql } from "./sentry-postgres.js";
import { consumeGrantAllOperation } from "./operations/consume-grant-all-operation.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { recordAdmissionDeniedOperation } from "./operations/record-admission-denied-operation.js";
import { recordAbuseDeniedOperation } from "./operations/record-abuse-denied-operation.js";
import { recordDeviceAuthorizationAuditOperation } from "./operations/record-device-authorization-audit-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import { checkSecretPossessionOperation } from "./operations/check-secret-possession-operation.js";
import {
  captureFirstValueFeedbackRpc,
  queryFirstValueUsageRpc,
  cancelOperationRpc,
  getOperationRpc,
  issueInjectionGrantRpc,
  resolveSessionWhoamiRpc,
  registerAgentSessionRpc,
  recordInjectionRunCompletedRpc,
} from "./rpc/runtime-metadata-rpc-delegates.js";
import { RuntimeServiceDelegatedPostAuthRpc } from "./rpc/runtime-service-delegated-post-auth-rpc.js";
import {
  acceptInvitationRpc,
  createInvitationRpc,
  createOperatorOrganizationRpc,
  provisionGuidedOrganizationRpc,
} from "./rpc/runtime-onboarding-rpc-delegates.js";
import { completeBootstrapOperatorClaimRpc } from "./rpc/runtime-bootstrap-rpc-delegates.js";
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
    const connStr = maybeRuntimeConnectionString(this.env);
    if (!connStr) {
      return run();
    }
    const { result, closing } = await runWithRuntimeConnection(connStr, run, {
      instrumentSql: instrumentRuntimeSql,
    });
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
    // TODO(INS-531): pass the concrete approval delivery ports (tenant-store-backed in-app +
    // email transport). Until then delivery is intentionally UNWIRED and surfaced loudly (a warn
    // at registration, a per-event error in the emitter) — the adapter, envelope safety, and audit
    // trigger still ship. Omitting the approval arg here must never be read as "delivery works".
    ensureAuditNotificationEmitterRegistered(this.env);
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
    return this.#post(input.actorToken, ({ accessActor }) =>
      consumeGrantOperation({ env: this.env, input, actor: accessActor }),
    );
  }

  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>> {
    return this.#post(input.actorToken, ({ accessActor }) =>
      consumeGrantAllOperation({ env: this.env, input, actor: accessActor }),
    );
  }

  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return this.#post(input.actorToken, ({ auditActor, accessActor }) =>
      writeSecretOperation({ env: this.env, input, auditActor, accessActor }),
    );
  }

  checkSecretPossession(
    input: CheckSecretPossessionRpcInput,
  ): Promise<RuntimeRpcResult<CheckSecretPossessionPayload>> {
    return this.#post(input.actorToken, ({ auditActor, accessActor }) =>
      checkSecretPossessionOperation({ env: this.env, input, auditActor, accessActor }),
    );
  }

  // --- Pre-auth identity/metadata methods (no hop token; trusted by the private binding) ---

  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>> {
    return this.#pre(async () => {
      const resolved = await resolveAdmissionForEdge(
        input.instanceId,
        input.workosUserId,
        input.sessionId,
      );
      return {
        userId: resolved.userId,
        cliSessionRevoked: resolved.cliSessionRevoked,
      };
    });
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

  recordDeviceAuthorizationAudit(
    input: RecordDeviceAuthorizationAuditRpcInput,
  ): Promise<RuntimeRpcResult<RecordDeviceAuthorizationAuditRpcPayload>> {
    return this.#pre(() => recordDeviceAuthorizationAuditOperation(input));
  }

  getBootstrapStatus(
    input: GetBootstrapStatusRpcInput,
  ): Promise<RuntimeRpcResult<BootstrapStatus>> {
    return this.#pre(() => getBootstrapStatus(input.instanceId));
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

  completeBootstrapOperatorClaim(input: CompleteBootstrapClaimRpcInput) {
    return completeBootstrapOperatorClaimRpc(this.#post.bind(this), input);
  }

  recordInjectionRunCompleted(input: RecordInjectionRunCompletedRpcInput) {
    return recordInjectionRunCompletedRpc(this.#post.bind(this), input);
  }
  captureFirstValueFeedback(input: CaptureFirstValueFeedbackRpcInput) {
    return captureFirstValueFeedbackRpc(this.#post.bind(this), input);
  }

  queryFirstValueUsage(input: QueryFirstValueUsageRpcInput) {
    return queryFirstValueUsageRpc(this.#post.bind(this), input);
  }

  resolveSessionWhoami(input: ResolveSessionWhoamiRpcInput) {
    return resolveSessionWhoamiRpc(this.#post.bind(this), input);
  }

  registerAgentSession(input: RegisterAgentSessionRpcInput) {
    return registerAgentSessionRpc(this.#post.bind(this), input);
  }

  /**
   * Tenant Suspension containment: revoke all active Injection Grants for the Organization.
   * Called from the suspension runbook path inside Runtime (no edge DB I/O).
   */
  revokeInjectionGrantsForTenantSuspension(input: {
    organizationId: Parameters<
      typeof revokeInjectionGrantsForTenantSuspension
    >[0]["organizationId"];
    auditActor: Parameters<typeof revokeInjectionGrantsForTenantSuspension>[0]["actor"];
    requestId?: RequestId;
  }): Promise<RevokeInjectionGrantsForTenantSuspensionResult> {
    return this.#withConnection(() =>
      revokeInjectionGrantsForTenantSuspension({
        organizationId: input.organizationId,
        actor: input.auditActor,
        ...(input.requestId !== undefined ? { request: { requestId: input.requestId } } : {}),
      }),
    );
  }

  /**
   * Compromise-response containment: revoke active grants pinned to the invalidated version.
   */
  revokeInjectionGrantsForCompromiseVersion(input: {
    organizationId: Parameters<
      typeof revokeInjectionGrantsForCompromiseVersion
    >[0]["organizationId"];
    secretVersionId: Parameters<
      typeof revokeInjectionGrantsForCompromiseVersion
    >[0]["secretVersionId"];
    auditActor: Parameters<typeof revokeInjectionGrantsForCompromiseVersion>[0]["actor"];
    requestId?: RequestId;
  }): Promise<RevokeInjectionGrantsForCompromiseVersionResult> {
    return this.#withConnection(() =>
      revokeInjectionGrantsForCompromiseVersion({
        organizationId: input.organizationId,
        secretVersionId: input.secretVersionId,
        actor: input.auditActor,
        ...(input.requestId !== undefined ? { request: { requestId: input.requestId } } : {}),
      }),
    );
  }
}

Object.assign(RuntimeServiceBase.prototype, RuntimeServiceDelegatedPostAuthRpc);

/**
 * Type-only re-export of the pre-Sentry-wrap class (INS-512). `Sentry.withSentry` returns its input
 * type unchanged (see `@sentry/cloudflare`'s `withSentry<..., T>(...args): T`), so the exported
 * `RuntimeService` is typed as `SentryRuntimeServiceConstructor` — a bare `WorkerEntrypoint`, none of
 * the RPC methods below. That erasure is why the Sentry cast on `RuntimeService` is otherwise
 * unchecked: nothing verifies the erased methods still satisfy `RuntimeRpc`. Exporting this type lets
 * `runtime-service-rpc-conformance.ts` assert against the actual method-bearing class instead of the
 * widened constructor type. Not a value export: importing it does not pull the class or its
 * `Object.assign` side effect a second time (`isolatedModules` erases type-only imports).
 */
export type { RuntimeServiceBase };

export const RuntimeService = Sentry.withSentry<
  RuntimeEnv,
  unknown,
  unknown,
  SentryRuntimeServiceConstructor
>(cloudflareSentryOptions, RuntimeServiceBase as unknown as SentryRuntimeServiceConstructor);
