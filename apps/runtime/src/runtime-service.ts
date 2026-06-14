import { WorkerEntrypoint } from "cloudflare:workers";

import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { consumeInjectionGrant } from "@insecur/runtime-injection";
import { assertSecretWriteCoordinate, writeNonProtectedSecret } from "@insecur/secret-store";
import { configureRuntimeConnection } from "@insecur/tenant-store";
import { authorizeScopeOrThrow, toAccessActor, toAuditActor } from "@insecur/worker-kit";
import type {
  ConsumeGrantRpcInput,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import { actorFromHopToken } from "./rpc/actor-from-token.js";
import { toRuntimeRpcError } from "./rpc/runtime-rpc-error.js";
import { createKeyringFromRuntimeEnv } from "./crypto/keyring-context.js";
import { runtimeDeliveryEnvelope } from "./runtime-delivery-envelope.js";

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
   * Hand the Hyperdrive connection string to the tenant store before any DB I/O. The string lives
   * only on `env.DB.connectionString`, so it cannot be read from `process.env` inside the Worker.
   * Called per RPC method (not the constructor) because the in-process fake binding builds this
   * service with a `DB`-less env; absent binding → the store falls back to `DATABASE_URL_RUNTIME`.
   */
  #configureDb(): void {
    const connStr = this.env.DB?.connectionString;
    if (connStr) {
      configureRuntimeConnection(connStr);
    }
  }

  async consumeGrant(
    input: ConsumeGrantRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
    try {
      this.#configureDb();
      const actor = await actorFromHopToken(this.env, input.actorToken);
      const result = await consumeInjectionGrant({
        keyring: createKeyringFromRuntimeEnv(this.env),
        organizationId: input.organizationId,
        grantId: input.grantId,
        ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
        ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
        actor: toAuditActor(actor),
        request: { requestId: input.requestId },
      });
      return {
        ok: true,
        value: runtimeDeliveryEnvelope(
          {
            grantId: input.grantId,
            secretId: result.secretId,
            secretVersionId: result.secretVersionId,
            variableKey: result.variableKey,
            valueUtf8: result.valueUtf8,
            ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
          },
          { requestId: input.requestId },
        ),
      };
    } catch (error) {
      return { ok: false, error: toRuntimeRpcError(error) };
    }
  }

  async writeSecret(
    input: WriteSecretRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    try {
      this.#configureDb();
      const actor = await actorFromHopToken(this.env, input.actorToken);
      const auditActor = toAuditActor(actor);
      const coordinate = {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      };
      // Authorization first, coordinate check second: a caller lacking write scope must get the
      // same insufficient_scope denial whether or not the URL environment exists, so the coordinate
      // check (which reads the environments table) cannot become a cross-project existence oracle.
      // The coordinate check then runs only for callers already entitled to write at this project.
      await authorizeScopeOrThrow({
        actor: toAccessActor(actor),
        auditActor,
        coordinate,
        requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
        requestId: input.requestId,
      });
      await assertSecretWriteCoordinate({
        ...coordinate,
        actor: auditActor,
        request: { requestId: input.requestId },
      });
      const result = await writeNonProtectedSecret({
        keyring: createKeyringFromRuntimeEnv(this.env),
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        variableKey: input.variableKey,
        actor: auditActor,
        valueUtf8: input.valueUtf8,
        ...(input.allowEmpty !== undefined ? { allowEmpty: input.allowEmpty } : {}),
        ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
        request: { requestId: input.requestId },
      });
      return {
        ok: true,
        value: {
          secretId: result.secretId,
          secretVersionId: result.secretVersionId,
          variableKey: result.variableKey,
          createdSecretShape: result.createdSecretShape,
          ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
        },
      };
    } catch (error) {
      return { ok: false, error: toRuntimeRpcError(error) };
    }
  }
}
