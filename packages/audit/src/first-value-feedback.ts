import {
  parseDisplayName,
  VALIDATION_ERROR_CODES,
  type DisplayName,
  type InjectionGrantId,
  type OperationId,
  type OrganizationId,
  type RequestId,
  type UserId,
} from "@insecur/domain";

export const FIRST_VALUE_FEEDBACK_KINDS = {
  blocker: "feedback.kind.blocker",
  friction: "feedback.kind.friction",
  praise: "feedback.kind.praise",
  suggestion: "feedback.kind.suggestion",
} as const;

export type FirstValueFeedbackKind =
  (typeof FIRST_VALUE_FEEDBACK_KINDS)[keyof typeof FIRST_VALUE_FEEDBACK_KINDS];

const FIRST_VALUE_FEEDBACK_KIND_SET = new Set<string>(Object.values(FIRST_VALUE_FEEDBACK_KINDS));

export function isFirstValueFeedbackKind(value: string): value is FirstValueFeedbackKind {
  return FIRST_VALUE_FEEDBACK_KIND_SET.has(value);
}

export interface CaptureFirstValueFeedbackInput {
  organizationId: OrganizationId;
  actorUserId: UserId;
  feedbackKind: string;
  note: string;
  grantId?: InjectionGrantId;
  operationId?: OperationId;
  requestId?: RequestId;
}

export interface ParsedFirstValueFeedbackInput {
  organizationId: OrganizationId;
  actorUserId: UserId;
  feedbackKind: FirstValueFeedbackKind;
  note: DisplayName;
  grantId?: InjectionGrantId;
  operationId?: OperationId;
  requestId?: RequestId;
}

export type ParseFirstValueFeedbackResult =
  | { ok: true; value: ParsedFirstValueFeedbackInput }
  | {
      ok: false;
      code:
        | typeof VALIDATION_ERROR_CODES.invalidFeedbackKind
        | typeof VALIDATION_ERROR_CODES.invalidDisplayName
        | typeof VALIDATION_ERROR_CODES.displayNameEmpty
        | typeof VALIDATION_ERROR_CODES.feedbackAssociationRequired;
    };

function hasFeedbackAssociation(input: CaptureFirstValueFeedbackInput): boolean {
  return (
    input.grantId !== undefined || input.operationId !== undefined || input.requestId !== undefined
  );
}

function buildParsedFeedbackInput(
  input: CaptureFirstValueFeedbackInput,
  feedbackKind: FirstValueFeedbackKind,
  note: DisplayName,
): ParsedFirstValueFeedbackInput {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    feedbackKind,
    note,
    ...(input.grantId !== undefined ? { grantId: input.grantId } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  };
}

type FirstValueFeedbackValidationCode = Extract<
  ParseFirstValueFeedbackResult,
  { ok: false }
>["code"];

export function throwFirstValueFeedbackValidationError(
  code: FirstValueFeedbackValidationCode,
): never {
  throw Object.assign(new Error(code), { code });
}

export function parseFirstValueFeedbackInput(
  input: CaptureFirstValueFeedbackInput,
): ParseFirstValueFeedbackResult {
  if (!isFirstValueFeedbackKind(input.feedbackKind)) {
    return { ok: false, code: VALIDATION_ERROR_CODES.invalidFeedbackKind };
  }

  const note = parseDisplayName(input.note);
  if (!note.ok) {
    return { ok: false, code: note.code };
  }

  if (!hasFeedbackAssociation(input)) {
    return { ok: false, code: VALIDATION_ERROR_CODES.feedbackAssociationRequired };
  }

  return {
    ok: true,
    value: buildParsedFeedbackInput(input, input.feedbackKind, note.value),
  };
}
