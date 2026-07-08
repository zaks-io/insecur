import type { RuntimeAdmissionRpc } from "./runtime-admission-rpc-interface.js";
import type { RuntimeAuditRpc } from "./runtime-audit-rpc-interface.js";
import type { RuntimeConnectionsRpc } from "./runtime-connections-rpc-interface.js";
import type { RuntimeHighAssuranceRpc } from "./runtime-high-assurance-rpc-interface.js";
import type { RuntimeInjectionRpc } from "./runtime-injection-rpc-interface.js";
import type { RuntimeMetadataRpc } from "./runtime-metadata-rpc-interface.js";
import type { RuntimeOperationsRpc } from "./runtime-operations-rpc-interface.js";
import type { RuntimeOrganizationsRpc } from "./runtime-organizations-rpc-interface.js";
import type { RuntimeSecretsRpc } from "./runtime-secrets-rpc-interface.js";
import type { RuntimeSessionRpc } from "./runtime-session-rpc-interface.js";
import type { RuntimeWebhookRpc } from "./runtime-webhook-rpc-interface.js";

export type { RuntimeAdmissionRpc } from "./runtime-admission-rpc-interface.js";
export type { RuntimeAuditRpc } from "./runtime-audit-rpc-interface.js";
export type { RuntimeConnectionsRpc } from "./runtime-connections-rpc-interface.js";
export type { RuntimeHighAssuranceRpc } from "./runtime-high-assurance-rpc-interface.js";
export type { RuntimeInjectionRpc } from "./runtime-injection-rpc-interface.js";
export type { RuntimeMetadataRpc } from "./runtime-metadata-rpc-interface.js";
export type { RuntimeOperationsRpc } from "./runtime-operations-rpc-interface.js";
export type { RuntimeOrganizationsRpc } from "./runtime-organizations-rpc-interface.js";
export type { RuntimeSecretsRpc } from "./runtime-secrets-rpc-interface.js";
export type { RuntimeSessionRpc } from "./runtime-session-rpc-interface.js";
export type { RuntimeWebhookRpc } from "./runtime-webhook-rpc-interface.js";

/**
 * The interface the API Worker binds against. The implementation
 * (`RuntimeService extends WorkerEntrypoint`) lives in `apps/runtime`; the API never imports it,
 * it only calls `c.env.RUNTIME.<method>(...)` typed by this contract.
 *
 * The method set is composed from cohesive per-domain sub-interfaces (each in its own file) so no
 * single file crosses the `max-lines` boundary as backend RPCs are added. Adding a new RPC method
 * means extending the sub-interface that owns its domain, not this barrel.
 */
export interface RuntimeRpc
  extends
    RuntimeSecretsRpc,
    RuntimeConnectionsRpc,
    RuntimeAdmissionRpc,
    RuntimeOrganizationsRpc,
    RuntimeOperationsRpc,
    RuntimeInjectionRpc,
    RuntimeMetadataRpc,
    RuntimeSessionRpc,
    RuntimeAuditRpc,
    RuntimeHighAssuranceRpc,
    RuntimeWebhookRpc {}
