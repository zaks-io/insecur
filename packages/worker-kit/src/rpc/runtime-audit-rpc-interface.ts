import type {
  ExportTenantAuditRpcInput,
  ExportTenantAuditRpcPayload,
  ListAuditEventsRpcInput,
  ListAuditEventsRpcPayload,
} from "./runtime-audit-rpc-contract.js";
import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";

export interface RuntimeAuditRpc {
  listAuditEvents(
    input: ListAuditEventsRpcInput,
  ): Promise<RuntimeRpcResult<ListAuditEventsRpcPayload>>;
  exportTenantAudit(
    input: ExportTenantAuditRpcInput,
  ): Promise<RuntimeRpcResult<ExportTenantAuditRpcPayload>>;
}
