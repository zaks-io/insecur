import { WorkerEntrypoint } from "cloudflare:workers";

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
import { issueInjectionGrant } from "@insecur/runtime-injection-issue";
import {
  completeBootstrapOperatorClaim,
  getBootstrapStatus,
  type BootstrapStatus,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import { resolveAdmittedUserId } from "@insecur/tenant-store";
import { runWithRuntimeConnection } from "@insecur/tenant-store";
import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import type { OperationPollResult } from "@insecur/operations";
import type {
  AcceptInvitationRpcInput,
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  GetBootstrapStatusRpcInput,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { getOperationOperation } from "./operations/get-operation-operation.js";
import { recordAdmissionDeniedOperation } from "./operations/record-admission-denied-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import { withRuntimeRpcEntry, type RuntimeRpcActorContext } from "./rpc/runtime-rpc-entry.js";
import { withRuntimeRpcUnauthEntry } from "./rpc/runtime-rpc-unauthenticated-entry.js";

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
export class RuntimeService extends WorkerEntrypoint<RuntimeEnv> {
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

  getBootstrapStatus(
    input: GetBootstrapStatusRpcInput,
  ): Promise<RuntimeRpcResult<BootstrapStatus>> {
    return this.#pre(() => getBootstrapStatus(input.instanceId));
  }

  // --- Post-auth non-keyring DB methods (carry a scoped hop token) ---

  provisionGuidedOrganization(
    input: ProvisionGuidedOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<ProvisionGuidedOrganizationResult>> {
    return this.#post(input.actorToken, ({ actor }) =>
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

  createOperatorOrganization(
    input: CreateOperatorOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<CreateOperatorOrganizationResult>> {
    return this.#post(input.actorToken, ({ actor }) =>
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

  createInvitation(
    input: CreateInvitationRpcInput,
  ): Promise<RuntimeRpcResult<CreateInvitationResult>> {
    return this.#post(input.actorToken, ({ actor }) =>
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

  acceptInvitation(
    input: AcceptInvitationRpcInput,
  ): Promise<RuntimeRpcResult<AcceptInvitationResult>> {
    return this.#post(input.actorToken, ({ actor }) =>
      acceptInvitation({
        invitationId: input.invitationId,
        organizationId: input.organizationId,
        acceptingUserId: actor.userId,
        ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
        request: { requestId: input.requestId },
      }),
    );
  }

  getOperation(input: GetOperationRpcInput): Promise<RuntimeRpcResult<OperationPollResult>> {
    return this.#post(input.actorToken, ({ auditActor, accessActor }) =>
      getOperationOperation({ input, auditActor, accessActor }),
    );
  }

  issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>> {
    return this.#post(input.actorToken, ({ accessActor }) =>
      issueInjectionGrant({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        selector: input.selector,
        // issueInjectionGrant takes the effective-access actor and resolves issuance scope +
        // derives the audit actor internally (main #199). Pass accessActor, not auditActor.
        actor: accessActor,
        request: { requestId: input.requestId },
      }),
    );
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
}
