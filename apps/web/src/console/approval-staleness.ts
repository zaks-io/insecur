import type { ConsoleHighAssuranceChallengeDetail } from "../console/approval-detail-parse.js";
import { shortDate } from "../console/projects.js";

export interface ApprovalStalenessNotice {
  readonly tone: "info" | "warning";
  readonly headline: string;
  readonly detail: string;
}

/** Metadata-only staleness copy for approval evidence since staging (INS-381). */
export function approvalStalenessNotice(
  challenge: ConsoleHighAssuranceChallengeDetail,
): ApprovalStalenessNotice | null {
  switch (challenge.status) {
    case "pending":
      return null;
    case "expired":
      return {
        tone: "warning",
        headline: "Challenge expired",
        detail: `This challenge expired ${shortDate(challenge.expiresAt)}. The requesting caller must stage a fresh bounded operation.`,
      };
    case "cleared":
      return {
        tone: "info",
        headline: "Already cleared",
        detail:
          "A human already cleared this challenge. The requesting caller can resume when it consumes the evidence.",
      };
    case "consumed":
      return {
        tone: "info",
        headline: "Evidence consumed",
        detail: "The bounded operation already consumed the cleared evidence.",
      };
    default:
      return {
        tone: "info",
        headline: "No longer pending",
        detail: `Current state: ${challenge.status}.`,
      };
  }
}
