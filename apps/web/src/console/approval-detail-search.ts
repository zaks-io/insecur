export interface ApprovalDetailSearch {
  readonly approved?: "1";
  readonly operationId?: string;
  readonly challengeId?: string;
  readonly clearedAt?: string;
  readonly approve?: "failed";
  readonly approveReason?: "factor" | "session" | "unenrolled" | "clear";
  readonly approveCode?: string;
}

const APPROVE_REASONS = new Set<"factor" | "session" | "unenrolled" | "clear">([
  "factor",
  "session",
  "unenrolled",
  "clear",
]);

function parseApproveReason(value: unknown): ApprovalDetailSearch["approveReason"] | undefined {
  if (typeof value !== "string" || !APPROVE_REASONS.has(value as "factor")) {
    return undefined;
  }
  return value as NonNullable<ApprovalDetailSearch["approveReason"]>;
}

export function parseApprovalDetailSearch(search: Record<string, unknown>): ApprovalDetailSearch {
  const approveReason = parseApproveReason(search.approveReason);
  return {
    ...(search.approved === "1" ? { approved: "1" as const } : {}),
    ...(typeof search.operationId === "string" ? { operationId: search.operationId } : {}),
    ...(typeof search.challengeId === "string" ? { challengeId: search.challengeId } : {}),
    ...(typeof search.clearedAt === "string" ? { clearedAt: search.clearedAt } : {}),
    ...(search.approve === "failed" ? { approve: "failed" as const } : {}),
    ...(typeof search.approveCode === "string" ? { approveCode: search.approveCode } : {}),
    ...(approveReason === undefined ? {} : { approveReason }),
  };
}
