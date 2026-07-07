import { createServerFn } from "@tanstack/react-start";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  HOME_RECENT_ACTIVITY_PAGE_SIZE,
  type ConsoleRecentActivity,
} from "../console/audit-events.js";
import { parseOrgAuditEventsBody } from "../console/audit-events.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  orgIdInput,
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
