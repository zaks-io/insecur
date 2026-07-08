import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgHighAssuranceChallengeDetailBody,
  type ConsoleHighAssuranceChallengeDetail,
} from "../console/approval-detail-parse.js";
import { parseOrgHighAssuranceChallengesBody } from "../console/approval-items.js";
import type { ConsolePendingApprovals } from "../console/approval-items.js";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  orgIdInput,
  requiredId,
  type ConsoleRead,
} from "./console-read.js";

function approvalDetailInput(input: unknown): { organizationId: string; approvalId: string } {
  const record = (input ?? {}) as Record<string, unknown>;
  return {
    organizationId: requiredId(record.organizationId, "organizationId"),
    approvalId: requiredId(record.approvalId, "approvalId"),
  };
}

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

/**
 * One High-Assurance Challenge metadata evidence read (INS-381) over the BFF scoped-token hop.
 */
export const loadOrgHighAssuranceChallengeDetail = createServerFn({ method: "GET" })
  .validator(approvalDetailInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleHighAssuranceChallengeDetail>> =>
    consoleRead(async (api) =>
      envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.orgHighAssuranceChallenge(data.organizationId, data.approvalId),
          parseOrgHighAssuranceChallengeDetailBody,
        ),
      ),
    ),
  );
