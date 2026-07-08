export interface ChallengeClearStepUpContext {
  readonly organizationId: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly environmentId?: string;
}

export interface ApprovalStepUpContext {
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly impactReviewFingerprint: string;
}

export interface PkceRoundTrip {
  readonly state: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  /** Present for passkey-enrollment round trips: binds the callback to the initiating WorkOS user. */
  readonly workosUserId?: string;
  readonly flow?: "login" | "passkey-enrollment" | "challenge-clear" | "approval-step-up";
  /** Present for challenge-clear round trips: binds step-up to one pending operation. */
  readonly challengeClear?: ChallengeClearStepUpContext;
  /** Present for approval-request approve round trips: binds step-up to one pending request. */
  readonly approvalStepUp?: ApprovalStepUpContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseChallengeClearContext(value: unknown): ChallengeClearStepUpContext | null {
  if (!isRecord(value)) {
    return null;
  }
  const { organizationId, operationId, projectId, environmentId } = value;
  if (
    typeof organizationId !== "string" ||
    typeof operationId !== "string" ||
    typeof projectId !== "string"
  ) {
    return null;
  }
  if (environmentId !== undefined && typeof environmentId !== "string") {
    return null;
  }
  return {
    organizationId,
    operationId,
    projectId,
    ...(environmentId === undefined ? {} : { environmentId }),
  };
}

function readApprovalStepUpFields(record: Record<string, unknown>): ApprovalStepUpContext | null {
  const organizationId = record.organizationId;
  const approvalRequestId = record.approvalRequestId;
  const projectId = record.projectId;
  const environmentId = record.environmentId;
  const impactReviewFingerprint = record.impactReviewFingerprint;
  if (
    typeof organizationId !== "string" ||
    typeof approvalRequestId !== "string" ||
    typeof projectId !== "string" ||
    typeof environmentId !== "string" ||
    typeof impactReviewFingerprint !== "string"
  ) {
    return null;
  }
  return {
    organizationId,
    approvalRequestId,
    projectId,
    environmentId,
    impactReviewFingerprint,
  };
}

export function parseOptionalChallengeClear(
  value: unknown,
): ChallengeClearStepUpContext | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return parseChallengeClearContext(value);
}

export function parseOptionalApprovalStepUp(
  value: unknown,
): ApprovalStepUpContext | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }
  return readApprovalStepUpFields(value);
}

export function isValidPkceFlow(flow: string | undefined): flow is PkceRoundTrip["flow"] {
  return (
    flow === undefined ||
    flow === "login" ||
    flow === "passkey-enrollment" ||
    flow === "challenge-clear" ||
    flow === "approval-step-up"
  );
}

export function buildPkceRoundTrip(
  core: Pick<PkceRoundTrip, "state" | "codeVerifier" | "returnTo">,
  parsed: Partial<PkceRoundTrip>,
  challengeClear: ChallengeClearStepUpContext | undefined,
  approvalStepUp: ApprovalStepUpContext | undefined,
): PkceRoundTrip {
  return {
    ...core,
    ...(parsed.workosUserId === undefined ? {} : { workosUserId: parsed.workosUserId }),
    ...(parsed.flow === undefined ? {} : { flow: parsed.flow }),
    ...(challengeClear === undefined ? {} : { challengeClear }),
    ...(approvalStepUp === undefined ? {} : { approvalStepUp }),
  };
}

export function validateChallengeClearForFlow(
  flow: PkceRoundTrip["flow"],
  challengeClear: ChallengeClearStepUpContext | undefined | null,
): challengeClear is ChallengeClearStepUpContext | undefined {
  return challengeClear !== null && !(flow === "challenge-clear" && challengeClear === undefined);
}

export function validateApprovalStepUpForFlow(
  flow: PkceRoundTrip["flow"],
  approvalStepUp: ApprovalStepUpContext | undefined | null,
): approvalStepUp is ApprovalStepUpContext | undefined {
  return approvalStepUp !== null && !(flow === "approval-step-up" && approvalStepUp === undefined);
}
