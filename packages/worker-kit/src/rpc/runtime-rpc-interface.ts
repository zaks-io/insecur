import type { RuntimeAuditRpc } from "./runtime-audit-rpc-interface.js";
import type { RuntimeConnectionsRpc } from "./runtime-connections-rpc-interface.js";
import type { RuntimeHighAssuranceRpc } from "./runtime-high-assurance-rpc-interface.js";
import type { RuntimeInjectionRpc } from "./runtime-injection-rpc-interface.js";
import type { RuntimeMetadataRpc } from "./runtime-metadata-rpc-interface.js";
import type { RuntimeOperationsRpc } from "./runtime-operations-rpc-interface.js";
import type { RuntimeOrganizationsRpc } from "./runtime-organizations-rpc-interface.js";
import type { RuntimePreAuthRpc } from "./runtime-pre-auth-rpc-interface.js";
import type { RuntimeProtectedChangeRpc } from "./runtime-protected-change-rpc-interface.js";
import type { RuntimeSecretSyncRpc } from "./runtime-secret-sync-rpc-interface.js";
import type { RuntimeSecretsRpc } from "./runtime-secrets-rpc-interface.js";
import type { RuntimeSessionRpc } from "./runtime-session-rpc-interface.js";
import type { RuntimeWebhookRpc } from "./runtime-webhook-rpc-interface.js";

/**
 * The interface the API Worker binds against. The implementation
 * (`RuntimeService extends WorkerEntrypoint`) lives in `apps/runtime`; the API never imports it,
 * it only calls `c.env.RUNTIME.<method>(...)` typed by this contract.
 *
 * The method set is composed from cohesive per-domain sub-interfaces (each in its own file) so no
 * single file crosses the `max-lines` boundary as backend RPCs are added. Adding a new RPC method
 * means extending the sub-interface that owns its domain. The sub-interfaces are internal
 * composition details and are deliberately not re-exported; only `RuntimeRpc` is public.
 */
export interface RuntimeRpc
  extends
    RuntimeSecretsRpc,
    RuntimeConnectionsRpc,
    RuntimePreAuthRpc,
    RuntimeOrganizationsRpc,
    RuntimeOperationsRpc,
    RuntimeInjectionRpc,
    RuntimeMetadataRpc,
    RuntimeSessionRpc,
    RuntimeAuditRpc,
    RuntimeHighAssuranceRpc,
    RuntimeProtectedChangeRpc,
    RuntimeSecretSyncRpc,
    RuntimeWebhookRpc {}
