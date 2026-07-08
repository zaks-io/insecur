import { createServerFn } from "@tanstack/react-start";
import { parseOrgHighAssuranceChallengesBody } from "../console/approval-items.js";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  orgIdInput,
  type ConsoleRead,
} from "./console-read.js";
import type { ConsolePendingApprovals } from "../console/approval-items.js";

/**
 * Pending Human Approval Surface read (INS-377): High-Assurance Challenge list over the BFF
 * scoped-token hop (ADR-0051). Home and the approvals inbox seed from loaders and poll this
 * server function.
 */
export const loadOrgPendingApprovals = createServerFn({ method: "GET" })
  .validator(orgIdInput)
  .handler(({ data }): Promise<ConsoleRead<ConsolePendingApprovals>> =>
    consoleRead(async (api) =>
      envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.orgHighAssuranceChallenges(data.organizationId),
          parseOrgHighAssuranceChallengesBody,
        ),
      ),
    ),
  );
