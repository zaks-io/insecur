import { createServerFn } from "@tanstack/react-start";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  auditSearchToApiFilters,
  parseAuditSearch,
  type AuditSearchParams,
} from "../console/audit-search.js";
import { parseAuditEventsBody, type ConsoleAuditPage } from "../console/audit.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  requiredId,
  type ConsoleRead,
} from "./console-read.js";

/** Default page size for the console audit event log (matches tenant audit query API default). */
const CONSOLE_AUDIT_DEFAULT_PAGE_SIZE = 25;

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
 * and filter passthrough over the BFF scoped-token hop (ADR-0051). Shared loader plumbing for
 * the Home recent-activity feed slice.
 */
export const loadOrgAuditEvents = createServerFn({ method: "GET" })
  .validator(loadOrgAuditEventsInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleAuditPage>> =>
    consoleRead(async (api) => {
      const filters = auditSearchToApiFilters(data);
      return envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.listAuditEvents(data.organizationId, {
            pageSize: CONSOLE_AUDIT_DEFAULT_PAGE_SIZE,
            ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
            ...(filters === undefined ? {} : { filters }),
          }),
          parseAuditEventsBody,
        ),
      );
    }),
  );
