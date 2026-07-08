import { createServerFn } from "@tanstack/react-start";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  CONSOLE_AUDIT_PAGE_SIZE,
  HOME_RECENT_ACTIVITY_PAGE_SIZE,
  type ConsoleRecentActivity,
} from "../console/audit-events.js";
import { parseOrgAuditEventsBody } from "../console/audit-events.js";
import {
  auditSearchToApiFilters,
  parseAuditSearch,
  type AuditSearchParams,
} from "../console/audit-search.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  orgIdInput,
  requiredId,
  type ConsoleRead,
} from "./console-read.js";

/**
 * Home recent-activity read (INS-372): tenant audit events over the BFF scoped-token hop
 * (ADR-0051). The route loader seeds the feed; the client polls this server function.
 */
export const loadOrgRecentActivity = createServerFn({ method: "GET" })
  .validator(orgIdInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleRecentActivity>> =>
    consoleRead(async (api) =>
      envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.orgAuditEvents(data.organizationId, {
            pageSize: HOME_RECENT_ACTIVITY_PAGE_SIZE,
          }),
          parseOrgAuditEventsBody,
        ),
      ),
    ),
  );

export interface LoadOrgAuditEventsInput extends AuditSearchParams {
  readonly organizationId: string;
}

function loadOrgAuditEventsInput(input: unknown): LoadOrgAuditEventsInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    organizationId: requiredId(raw.organizationId, "organizationId"),
    ...parseAuditSearch(raw),
  };
}

/**
 * Tenant audit query read for the console (INS-376): metadata-only events with cursor pagination
 * and filter passthrough over the BFF scoped-token hop (ADR-0051).
 */
export const loadOrgAuditEvents = createServerFn({ method: "GET" })
  .validator(loadOrgAuditEventsInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleRecentActivity>> =>
    consoleRead(async (api) => {
      const filters = auditSearchToApiFilters(data);
      return envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.orgAuditEvents(data.organizationId, {
            pageSize: CONSOLE_AUDIT_PAGE_SIZE,
            ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
            ...(filters === undefined ? {} : { filters }),
          }),
          parseOrgAuditEventsBody,
        ),
      );
    }),
  );
