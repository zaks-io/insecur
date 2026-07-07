import type { AuditEventRead, AuditEventsPage } from "@insecur/audit";
import { AUDIT_EVENTS_DEFAULT_PAGE_SIZE } from "@insecur/audit";
import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { requireOrganizationScope } from "./audit-org-scope.js";
import { buildAuditTailFilters, type AuditTailCommandOptions } from "./audit-tail-options.js";

export type { AuditTailCommandOptions } from "./audit-tail-options.js";

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new CliError({
      code: "validation.invalid_opaque_resource_id",
      message: "Invalid audit tail limit.",
      retryable: false,
    });
  }
  return limit;
}

function formatAuditEventActor(event: AuditEventRead): string {
  if (event.actor.actorType === "user") {
    return event.actor.userId ?? "user";
  }
  if (event.actor.actorType === "machine") {
    return event.actor.machineIdentityId ?? "machine";
  }
  return "ci_exchange";
}

function formatAuditTailHuman(data: AuditEventsPage): string {
  if (data.events.length === 0) {
    return "No recent audit events.";
  }
  return data.events
    .map(
      (event) =>
        `${event.createdAt} ${event.eventCode} ${event.outcome} actor=${formatAuditEventActor(event)} id=${event.auditEventId}`,
    )
    .join("\n");
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
    throw new CliError(result.envelope.error);
  }

  renderSuccess(successEnvelope(result.envelope.data), flags, formatAuditTailHuman);
  return 0;
}
