import {
  VALIDATION_ERROR_CODES,
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

/** Closed vocabulary for metadata-only feedback notes; no user-authored free text. */
export const FIRST_VALUE_FEEDBACK_NOTE_CODES = {
  cliInitBlocker: "feedback.note.cli_init_blocker",
  grantFlowBlocker: "feedback.note.grant_flow_blocker",
  setupFriction: "feedback.note.setup_friction",
  docsFriction: "feedback.note.docs_friction",
  praiseLoop: "feedback.note.praise_loop",
  praiseSpeed: "feedback.note.praise_speed",
  suggestOnboarding: "feedback.note.suggest_onboarding",
  suggestDocs: "feedback.note.suggest_docs",
} as const;

export type FirstValueFeedbackNoteCode =
  (typeof FIRST_VALUE_FEEDBACK_NOTE_CODES)[keyof typeof FIRST_VALUE_FEEDBACK_NOTE_CODES];

const FIRST_VALUE_FEEDBACK_NOTE_CODE_SET = new Set<string>(
  Object.values(FIRST_VALUE_FEEDBACK_NOTE_CODES),
);

export function isFirstValueFeedbackNoteCode(value: string): value is FirstValueFeedbackNoteCode {
  return FIRST_VALUE_FEEDBACK_NOTE_CODE_SET.has(value);
}

export interface CaptureFirstValueFeedbackInput {
  organizationId: OrganizationId;
  actorUserId: UserId;
  feedbackKind: string;
  noteCode: string;
  grantId?: InjectionGrantId;
  operationId?: OperationId;
  requestId?: RequestId;
}

export interface ParsedFirstValueFeedbackInput {
  organizationId: OrganizationId;
  actorUserId: UserId;
  feedbackKind: FirstValueFeedbackKind;
  noteCode: FirstValueFeedbackNoteCode;
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
        | typeof VALIDATION_ERROR_CODES.invalidFeedbackNoteCode
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
  noteCode: FirstValueFeedbackNoteCode,
): ParsedFirstValueFeedbackInput {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    feedbackKind,
    noteCode,
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

  if (!isFirstValueFeedbackNoteCode(input.noteCode)) {
    return { ok: false, code: VALIDATION_ERROR_CODES.invalidFeedbackNoteCode };
  }

  if (!hasFeedbackAssociation(input)) {
    return { ok: false, code: VALIDATION_ERROR_CODES.feedbackAssociationRequired };
  }

  return {
    ok: true,
    value: buildParsedFeedbackInput(input, input.feedbackKind, input.noteCode),
  };
}
