import type { AuditEventRead, AuditEventsPage } from "@insecur/audit";
import { AUDIT_EVENTS_DEFAULT_PAGE_SIZE, AUDIT_EVENTS_MAX_PAGE_SIZE } from "@insecur/audit";
import { successEnvelope, VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { statusTone, truncateId } from "../output/cell-format.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import { emptyState } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { getStyle } from "../output/style.js";
import { renderTable } from "../output/table.js";
import { requireOrganizationScope } from "./audit-org-scope.js";
import { buildAuditTailFilters, type AuditTailCommandOptions } from "./audit-tail-options.js";

export type { AuditTailCommandOptions } from "./audit-tail-options.js";

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_EVENTS_MAX_PAGE_SIZE) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `Invalid audit tail limit. Use an integer from 1 to ${String(AUDIT_EVENTS_MAX_PAGE_SIZE)}.`,
      retryable: false,
    });
  }
  return limit;
}

function formatAuditEventActor(event: AuditEventRead): string {
  const s = getStyle();
  if (event.actor.actorType === "user") {
    return event.actor.userId === undefined
      ? "user"
      : `user:${truncateId(event.actor.userId, s.ascii)}`;
  }
  if (event.actor.actorType === "machine") {
    const id = event.actor.machineIdentityId;
    return id === undefined ? "machine" : `machine:${truncateId(id, s.ascii)}`;
  }
  return "ci";
}

function formatAuditResource(event: AuditEventRead): string {
  if (event.resource === null) {
    return "—";
  }
  return `${event.resource.type} ${truncateId(event.resource.id, getStyle().ascii)}`;
}

function formatAuditTailHuman(data: AuditEventsPage): string {
  if (data.events.length === 0) {
    return emptyState("No audit events match your filters.");
  }
  return renderTable(
    [
      { header: "Time", get: (event) => ({ kind: "time", iso: event.createdAt }) },
      { header: "Event", get: (event) => ({ kind: "plain", text: event.eventCode }) },
      {
        header: "Outcome",
        get: (event) => ({ kind: "status", text: event.outcome, tone: statusTone(event.outcome) }),
      },
      { header: "Actor", get: (event) => ({ kind: "plain", text: formatAuditEventActor(event) }) },
      { header: "Resource", get: (event) => ({ kind: "plain", text: formatAuditResource(event) }) },
      { header: "Event ID", get: (event) => ({ kind: "id", text: event.auditEventId }) },
    ],
    data.events,
  );
}

export async function runAuditTailCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: AuditTailCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const { orgId } = requireOrganizationScope(context.scope);
  const pageSize = parseLimit(commandOptions.limit) ?? AUDIT_EVENTS_DEFAULT_PAGE_SIZE;
  const filters = buildAuditTailFilters(commandOptions);

  const result = await api.listAuditEvents({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgId,
    pageSize,
    ...(commandOptions.cursor === undefined ? {} : { cursor: commandOptions.cursor }),
    ...(filters === undefined ? {} : { filters }),
  });

  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  renderSuccess(successEnvelope(result.envelope.data), flags, formatAuditTailHuman);
  return 0;
}
