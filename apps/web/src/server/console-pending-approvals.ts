import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgApprovalRequestDetailBody,
  type ConsoleApprovalRequestDetail,
} from "../console/approval-request-detail-parse.js";
import { parseOrgApprovalRequestsBody } from "../console/approval-request-items-parse.js";
import {
  mergePendingApprovalItems,
  type ConsoleHighAssuranceChallengeItem,
  type ConsolePendingApprovals,
} from "../console/approval-items.js";
import { parseHighAssuranceChallengeEntry } from "../console/approval-items-parse.js";
import { parseOrgHighAssuranceChallengeDetailBody } from "../console/approval-detail-parse.js";
import type { ConsoleHighAssuranceChallengeDetail } from "../console/approval-detail-parse.js";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  consoleRead,
  envelopeParseToReadResult,
  orgIdInput,
  requiredId,
  runConsoleReadSteps,
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
 * Pending Human Approval Surface read (INS-377, INS-86): High-Assurance Challenge and Approval
 * Request lists over the BFF scoped-token hop (ADR-0051).
 */
export const loadOrgPendingApprovals = createServerFn({ method: "GET" })
  .validator(orgIdInput)
  .handler(({ data }): Promise<ConsoleRead<ConsolePendingApprovals>> =>
    consoleRead(async (api) =>
      runConsoleReadSteps(
        api,
        [
          {
            fetch: (client) => client.orgHighAssuranceChallenges(data.organizationId),
            parse: (body) => {
              if (typeof body !== "object" || body === null) {
                return null;
              }
              const envelope = body as Record<string, unknown>;
              if (
                envelope.ok !== true ||
                typeof envelope.data !== "object" ||
                envelope.data === null
              ) {
                return null;
              }
              const challenges = (envelope.data as Record<string, unknown>).challenges;
              if (!Array.isArray(challenges)) {
                return null;
              }
              const parsed = challenges.map(parseHighAssuranceChallengeEntry);
              return parsed.every(
                (entry): entry is ConsoleHighAssuranceChallengeItem => entry !== null,
              )
                ? parsed
                : null;
            },
          },
          {
            fetch: (client) => client.orgApprovalRequests(data.organizationId),
            parse: (body) => parseOrgApprovalRequestsBody(body)?.items ?? null,
          },
        ],
        (challenges, approvalRequests) => ({
          items: mergePendingApprovalItems(challenges, approvalRequests),
        }),
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

/**
 * One Approval Request metadata evidence read (INS-86) over the BFF scoped-token hop.
 */
export const loadOrgApprovalRequestDetail = createServerFn({ method: "GET" })
  .validator(approvalDetailInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleApprovalRequestDetail>> =>
    consoleRead(async (api) =>
      envelopeParseToReadResult(
        parseConsoleReadEnvelope(
          await api.orgApprovalRequest(data.organizationId, data.approvalId),
          parseOrgApprovalRequestDetailBody,
        ),
      ),
    ),
  );
