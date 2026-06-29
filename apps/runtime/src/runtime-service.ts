import { WorkerEntrypoint } from "cloudflare:workers";

import { runWithRuntimeConnection } from "@insecur/tenant-store";
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

import type { RuntimeEnv } from "./env.js";
import { acceptInvitationOperation } from "./operations/accept-invitation-operation.js";
import { completeBootstrapClaimOperation } from "./operations/complete-bootstrap-claim-operation.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { createInvitationOperation } from "./operations/create-invitation-operation.js";
import { createOperatorOrganizationOperation } from "./operations/create-operator-organization-operation.js";
import { getBootstrapStatusOperation } from "./operations/get-bootstrap-status-operation.js";
import { getOperationOperation } from "./operations/get-operation-operation.js";
import { issueInjectionGrantOperation } from "./operations/issue-injection-grant-operation.js";
import { provisionGuidedOrganizationOperation } from "./operations/provision-guided-organization-operation.js";
import { recordAdmissionDeniedOperation } from "./operations/record-admission-denied-operation.js";
import { resolveAdmissionOperation } from "./operations/resolve-admission-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import { withRuntimeRpcEntry } from "./rpc/runtime-rpc-entry.js";
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

  #rpcEntryOptions(actorToken: string) {
    return {
      env: this.env,
      actorToken,
    };
  }

  async consumeGrant(
    input: ConsumeGrantRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ auditActor }) =>
        consumeGrantOperation({ env: this.env, input, auditActor }),
      ),
    );
  }

  async writeSecret(
    input: WriteSecretRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(
        this.#rpcEntryOptions(input.actorToken),
        async ({ auditActor, accessActor }) =>
          writeSecretOperation({ env: this.env, input, auditActor, accessActor }),
      ),
    );
  }

  // --- Pre-auth identity/metadata methods (no hop token; trusted by the private binding) ---

  async resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>> {
    return this.#withConnection(() =>
      withRuntimeRpcUnauthEntry(() => resolveAdmissionOperation(input)),
    );
  }

  async recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>> {
    return this.#withConnection(() =>
      withRuntimeRpcUnauthEntry(() => recordAdmissionDeniedOperation(input)),
    );
  }

  async getBootstrapStatus(
    input: GetBootstrapStatusRpcInput,
  ): Promise<RuntimeRpcResult<BootstrapStatus>> {
    return this.#withConnection(() =>
      withRuntimeRpcUnauthEntry(() => getBootstrapStatusOperation(input)),
    );
  }

  // --- Post-auth non-keyring DB methods (carry a scoped hop token) ---

  async provisionGuidedOrganization(
    input: ProvisionGuidedOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<ProvisionGuidedOrganizationResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ actor }) =>
        provisionGuidedOrganizationOperation({ actor, input }),
      ),
    );
  }

  async createOperatorOrganization(
    input: CreateOperatorOrganizationRpcInput,
  ): Promise<RuntimeRpcResult<CreateOperatorOrganizationResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ actor }) =>
        createOperatorOrganizationOperation({ actor, input }),
      ),
    );
  }

  async createInvitation(
    input: CreateInvitationRpcInput,
  ): Promise<RuntimeRpcResult<CreateInvitationResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ actor }) =>
        createInvitationOperation({ actor, input }),
      ),
    );
  }

  async acceptInvitation(
    input: AcceptInvitationRpcInput,
  ): Promise<RuntimeRpcResult<AcceptInvitationResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ actor }) =>
        acceptInvitationOperation({ actor, input }),
      ),
    );
  }

  async getOperation(input: GetOperationRpcInput): Promise<RuntimeRpcResult<OperationPollResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(
        this.#rpcEntryOptions(input.actorToken),
        async ({ auditActor, accessActor }) =>
          getOperationOperation({ input, auditActor, accessActor }),
      ),
    );
  }

  async issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ accessActor }) =>
        issueInjectionGrantOperation({ input, accessActor }),
      ),
    );
  }

  async completeBootstrapOperatorClaim(
    input: CompleteBootstrapClaimRpcInput,
  ): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>> {
    return this.#withConnection(() =>
      withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ actor }) =>
        completeBootstrapClaimOperation({ actor, input }),
      ),
    );
  }
}
