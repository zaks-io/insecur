import { WorkerEntrypoint } from "cloudflare:workers";

import {
  completeBootstrapOperatorClaim,
  getBootstrapStatus,
  type BootstrapStatus,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import { resolveAdmittedUserId, runWithRuntimeConnection } from "@insecur/tenant-store";
import type {
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  GetBootstrapStatusRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  IsCliSessionRevokedRpcInput,
  IsCliSessionRevokedRpcPayload,
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import { ensureAuditNotificationEmitterRegistered } from "./notifications/runtime-notification-registration.js";
import { consumeGrantAllOperation } from "./operations/consume-grant-all-operation.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { recordAdmissionDeniedOperation } from "./operations/record-admission-denied-operation.js";
import { recordAbuseDeniedOperation } from "./operations/record-abuse-denied-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import { isCliSessionRevokedOperation } from "./operations/revoke-cli-session-operation.js";
import { withRuntimeRpcEntry, type RuntimeRpcActorContext } from "./rpc/runtime-rpc-entry.js";
import { withRuntimeRpcUnauthEntry } from "./rpc/runtime-rpc-unauthenticated-entry.js";
import type { PostAuthRpcRunner } from "./rpc/post-auth-rpc-runner.js";

/**
 * Shared RPC connection and auth pipeline for {@link RuntimeServiceBase}. Subclasses add
 * post-auth metadata delegates; keyring-bound and pre-auth methods live here.
 */
export class RuntimeServiceCore extends WorkerEntrypoint<RuntimeEnv> {
  async #withConnection<T>(run: () => Promise<T>): Promise<T> {
    const connStr = this.env.DB?.connectionString;
    if (!connStr) {
      return run();
    }
    const { result, closing } = await runWithRuntimeConnection(connStr, run);
    this.ctx.waitUntil(closing);
    return result;
  }

  protected postAuth<T>(
    actorToken: string,
    run: (actors: RuntimeRpcActorContext) => Promise<T>,
  ): Promise<RuntimeRpcResult<T>> {
    ensureAuditNotificationEmitterRegistered(this.env);
    return this.#withConnection(() => withRuntimeRpcEntry({ env: this.env, actorToken }, run));
  }

  protected bindPostAuth(): PostAuthRpcRunner {
    return this.postAuth.bind(this);
  }

  #pre<T>(run: () => Promise<T>): Promise<RuntimeRpcResult<T>> {
    return this.#withConnection(() => withRuntimeRpcUnauthEntry(run));
  }

  consumeGrant(input: ConsumeGrantRpcInput): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
    return this.postAuth(input.actorToken, ({ auditActor }) =>
      consumeGrantOperation({ env: this.env, input, auditActor }),
    );
  }

  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>> {
    return this.postAuth(input.actorToken, ({ auditActor }) =>
      consumeGrantAllOperation({ env: this.env, input, auditActor }),
    );
  }

  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return this.postAuth(input.actorToken, ({ auditActor, accessActor }) =>
      writeSecretOperation({ env: this.env, input, auditActor, accessActor }),
    );
  }

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

  completeBootstrapOperatorClaim(
    input: CompleteBootstrapClaimRpcInput,
  ): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>> {
    return this.postAuth(input.actorToken, ({ actor }) =>
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
