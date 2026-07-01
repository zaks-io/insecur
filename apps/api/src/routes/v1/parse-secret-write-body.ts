import {
  DEFAULT_GENERATED_SECRET_RANDOM_BYTES,
  MAX_GENERATED_SECRET_RANDOM_BYTES,
  SECRET_ERROR_CODES,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import {
  encodeRequestValueUtf8,
  parseJsonBody,
  parseOptionalSecretId,
  parseVariableKeyField,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  readSecretValueField,
} from "@insecur/worker-kit";
import type { RuntimeGeneratedSecretInput } from "@insecur/worker-kit";

interface ParsedSecretWriteBody {
  variableKey: VariableKey;
  localValueFile?: string;
  allowEmpty?: boolean;
  secretId?: SecretId;
}

export type ParsedSecretWriteInput = ParsedSecretWriteBody &
  (
    | { valueUtf8: Uint8Array; generate?: never }
    | { generate: RuntimeGeneratedSecretInput; valueUtf8?: never }
  );

type ParsedSecretPayload =
  | { valueUtf8: Uint8Array; generate?: never }
  | { generate: RuntimeGeneratedSecretInput; valueUtf8?: never };

function inputModeError(message: string): Error {
  return Object.assign(new Error(message), {
    code: SECRET_ERROR_CODES.invalidInputMode,
  });
}

function valueTooLargeError(message: string): Error {
  return Object.assign(new Error(message), {
    code: SECRET_ERROR_CODES.valueTooLarge,
  });
}

function readGenerateRequest(raw: unknown): Record<string, unknown> {
  if (raw === "random") {
    return { mode: "random", lengthBytes: DEFAULT_GENERATED_SECRET_RANDOM_BYTES };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw inputModeError("Invalid generate request.");
  }
  return raw as Record<string, unknown>;
}

function readGenerateMode(record: Record<string, unknown>): "random" {
  const mode = record.mode ?? "random";
  if (mode === "random") {
    return mode;
  }
  throw inputModeError("Unsupported generate mode.");
}

function readGenerateLength(record: Record<string, unknown>): number {
  const lengthBytes = record.lengthBytes ?? DEFAULT_GENERATED_SECRET_RANDOM_BYTES;
  if (!Number.isInteger(lengthBytes) || typeof lengthBytes !== "number" || lengthBytes < 1) {
    throw inputModeError("Generated secret length must be a positive integer.");
  }
  if (lengthBytes > MAX_GENERATED_SECRET_RANDOM_BYTES) {
    throw valueTooLargeError("Generated secret length exceeds the V1 secret value size limit.");
  }
  return lengthBytes;
}

function parseGeneratedSecretInput(raw: unknown): RuntimeGeneratedSecretInput | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const record = readGenerateRequest(raw);
  return { mode: readGenerateMode(record), lengthBytes: readGenerateLength(record) };
}

function assertSingleSecretInput(
  body: Record<string, unknown>,
  generate: RuntimeGeneratedSecretInput | undefined,
): void {
  if (body.value !== undefined && generate !== undefined) {
    throw inputModeError("Use either value or generate, not both.");
  }
  if (body.value === undefined && generate === undefined) {
    throw Object.assign(new Error("Secret input is required."), {
      code: SECRET_ERROR_CODES.inputRequired,
    });
  }
}

function parseSecretPayload(
  body: Record<string, unknown>,
  generate: RuntimeGeneratedSecretInput | undefined,
): ParsedSecretPayload {
  return generate === undefined
    ? { valueUtf8: encodeRequestValueUtf8(readSecretValueField(body)) }
    : { generate };
}

function appendSecretWriteMetadata(
  parsed: ParsedSecretWriteInput,
  body: Record<string, unknown>,
): ParsedSecretWriteInput {
  const allowEmpty = readOptionalBoolean(body, "allowEmpty");
  const secretId = parseOptionalSecretId(readOptionalString(body, "secretId"));
  const localValueFile = readOptionalString(body, "localValueFile");
  if (allowEmpty !== undefined) {
    parsed.allowEmpty = allowEmpty;
  }
  if (secretId !== undefined) {
    parsed.secretId = secretId;
  }
  if (localValueFile !== undefined) {
    parsed.localValueFile = localValueFile;
  }
  return parsed;
}

export async function parseSecretWriteBody(request: {
  json: () => Promise<unknown>;
}): Promise<ParsedSecretWriteInput> {
  const body = parseJsonBody(await request.json());
  const generate = parseGeneratedSecretInput(body.generate);
  assertSingleSecretInput(body, generate);
  const parsed: ParsedSecretWriteInput = {
    variableKey: parseVariableKeyField(readRequiredString(body, "variableKey")),
    ...parseSecretPayload(body, generate),
  };
  return appendSecretWriteMetadata(parsed, body);
}
