import type { KnownErrorCode } from "@insecur/domain";
import type { AuditEventCode } from "./audit-event-codes.js";
import type { AuditEventDetails } from "./audit-types.js";

/** Shared persisted audit_events row shape for store reads. */
export interface AuditEventStoreRow {
  readonly id: string;
  readonly org_id: string;
  readonly event_code: AuditEventCode;
  readonly outcome: "success" | "denied";
  readonly result_code: KnownErrorCode;
  readonly actor_type: string;
  readonly actor_user_id: string | null;
  readonly actor_machine_identity_id: string | null;
  readonly project_id: string | null;
  readonly environment_id: string | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly related_resource_type: string | null;
  readonly related_resource_id: string | null;
  readonly request_id: string | null;
  readonly operation_id: string | null;
  readonly details: AuditEventDetails | null;
  readonly created_at: Date;
}
