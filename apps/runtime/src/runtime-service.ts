import { WorkerEntrypoint } from "cloudflare:workers";

import { configureRuntimeConnection } from "@insecur/tenant-store";
import type {
  ConsumeGrantRpcInput,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import type { RuntimeEnv } from "./env.js";
import { consumeGrantOperation } from "./operations/consume-grant-operation.js";
import { writeSecretOperation } from "./operations/write-secret-operation.js";
import { withRuntimeRpcEntry } from "./rpc/runtime-rpc-entry.js";

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

  #rpcEntryOptions(actorToken: string) {
    return {
      env: this.env,
      actorToken,
      configureDb: () => {
        this.#configureDb();
      },
    };
  }

  async consumeGrant(
    input: ConsumeGrantRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
    return withRuntimeRpcEntry(this.#rpcEntryOptions(input.actorToken), async ({ auditActor }) =>
      consumeGrantOperation({ env: this.env, input, auditActor }),
    );
  }

  async writeSecret(
    input: WriteSecretRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
    return withRuntimeRpcEntry(
      this.#rpcEntryOptions(input.actorToken),
      async ({ auditActor, accessActor }) =>
        writeSecretOperation({ env: this.env, input, auditActor, accessActor }),
    );
  }
}
