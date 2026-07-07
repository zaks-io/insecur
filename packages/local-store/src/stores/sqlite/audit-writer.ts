import { auditEventId, environmentId, projectId, secretId } from "@insecur/domain";

import type { LocalAuditWriter } from "../../contracts/audit-writer.js";
import type { LocalAuditEventInput, LocalAuditEventRow } from "../../contracts/types.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";
import { nowIso } from "./helpers.js";

export class SqliteLocalAuditWriter implements LocalAuditWriter {
  constructor(private readonly database: LocalSqliteDatabase) {}

  writeEvent(input: LocalAuditEventInput): Promise<{ auditEventId: string }> {
    const id = auditEventId.generate();
    this.database
      .prepare(
        `INSERT INTO local_audit_events
         (id, event_code, outcome, project_id, environment_id, secret_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.eventCode,
        input.outcome,
        input.projectId ?? null,
        input.environmentId ?? null,
        input.secretId ?? null,
        JSON.stringify(input.details ?? {}),
        nowIso(),
      );
    return Promise.resolve({ auditEventId: id });
  }

  listEvents(projectIdFilter?: string): Promise<readonly LocalAuditEventRow[]> {
    const rows =
      projectIdFilter === undefined
        ? (this.database
            .prepare(
              `SELECT id, event_code, outcome, project_id, environment_id, secret_id, details_json, created_at
               FROM local_audit_events
               ORDER BY created_at ASC`,
            )
            .all() as unknown as AuditDbRow[])
        : (this.database
            .prepare(
              `SELECT id, event_code, outcome, project_id, environment_id, secret_id, details_json, created_at
               FROM local_audit_events
               WHERE project_id = ?
               ORDER BY created_at ASC`,
            )
            .all(projectIdFilter) as unknown as AuditDbRow[]);
    return Promise.resolve(
      rows.map((row) => ({
        auditEventId: row.id,
        eventCode: row.event_code,
        outcome: row.outcome === "denied" ? "denied" : "success",
        projectId: row.project_id ? projectId.brand(row.project_id) : null,
        environmentId: row.environment_id ? environmentId.brand(row.environment_id) : null,
        secretId: row.secret_id ? secretId.brand(row.secret_id) : null,
        details: JSON.parse(row.details_json) as Record<string, string | number | boolean | null>,
        createdAt: row.created_at,
      })),
    );
  }
}

interface AuditDbRow {
  id: string;
  event_code: string;
  outcome: string;
  project_id: string | null;
  environment_id: string | null;
  secret_id: string | null;
  details_json: string;
  created_at: string;
}
