import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  IMPORT_ERROR_CODES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  parseVariableKey,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { ListProjectSecretsData } from "../api/navigation-api-types.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import { parseDotenvImportFile } from "../input/dotenv-import-parser.js";
import { validateSecretValueUtf8 } from "../input/validate-secret-value.js";
import type { ImportPreflightIssue, ImportPreflightWritePlan } from "./import-preflight-types.js";

interface TargetEnvironmentMetadata {
  readonly lifecycleStage: string;
  readonly isProtected: boolean;
}

export function assertImportableEnvironment(environment: TargetEnvironmentMetadata): void {
  if (
    environment.lifecycleStage !== ENVIRONMENT_LIFECYCLE_STAGES.development ||
    environment.isProtected
  ) {
    throw new CliError({
      code: IMPORT_ERROR_CODES.unsupportedEnvironment,
      message: "Secret import supports only non-protected development environments.",
      retryable: false,
    });
  }
}

function decodeImportFileUtf8(fileBytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
  } catch {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidEncoding,
      message: "Import source file must be valid UTF-8 text.",
      retryable: false,
    });
  }
}

function validateVariableKeyPrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined) {
    return undefined;
  }
  const parsed = parseVariableKey(prefix);
  if (!parsed.ok) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
      message: `Invalid --variable-key-prefix: ${prefix}. Prefixes must match ^[A-Z_][A-Z0-9_]*$.`,
      retryable: false,
    });
  }
  return prefix;
}

function applyVariableKeyPrefix(parsedKey: string, prefix: string | undefined): string {
  return prefix === undefined ? parsedKey : `${prefix}${parsedKey}`;
}

export function collectDuplicateKeys(
  finalKeys: readonly { variableKey: VariableKey; lineNumber: number }[],
): {
  readonly duplicates: readonly VariableKey[];
  readonly issues: readonly ImportPreflightIssue[];
} {
  const seen = new Map<VariableKey, number>();
  const duplicates = new Set<VariableKey>();
  const issues: ImportPreflightIssue[] = [];

  for (const entry of finalKeys) {
    if (seen.has(entry.variableKey)) {
      duplicates.add(entry.variableKey);
      issues.push({
        variableKey: entry.variableKey,
        code: IMPORT_ERROR_CODES.duplicateVariableKey,
      });
      continue;
    }
    seen.set(entry.variableKey, entry.lineNumber);
  }

  return {
    duplicates: [...duplicates].sort(),
    issues,
  };
}

function existingSecretKeysForEnvironment(
  matrixRows: readonly {
    readonly variableKey: VariableKey;
    readonly cells: readonly { readonly environmentId: EnvironmentId; readonly present: boolean }[];
  }[],
  environmentId: EnvironmentId,
): Set<VariableKey> {
  const existing = new Set<VariableKey>();
  for (const row of matrixRows) {
    const cell = row.cells.find((candidate) => candidate.environmentId === environmentId);
    if (cell?.present === true) {
      existing.add(row.variableKey);
    }
  }
  return existing;
}

function validateDotenvImportEntry(
  entry: {
    readonly parsedKey: string;
    readonly lineNumber: number;
    readonly valueUtf8: Uint8Array;
  },
  prefix: string | undefined,
): {
  readonly issue?: ImportPreflightIssue;
  readonly finalEntry?: { variableKey: VariableKey; lineNumber: number; valueUtf8: Uint8Array };
} {
  const finalKeyRaw = applyVariableKeyPrefix(entry.parsedKey, prefix);
  const parsedKey = parseVariableKey(finalKeyRaw);
  if (!parsedKey.ok) {
    return {
      issue: { lineNumber: entry.lineNumber, code: VALIDATION_ERROR_CODES.invalidVariableKey },
    };
  }

  try {
    validateSecretValueUtf8(entry.valueUtf8);
  } catch (error) {
    if (error instanceof CliError) {
      return { issue: { lineNumber: entry.lineNumber, code: error.code } };
    }
    throw error;
  }

  return {
    finalEntry: {
      variableKey: parsedKey.value,
      lineNumber: entry.lineNumber,
      valueUtf8: entry.valueUtf8,
    },
  };
}

export function buildValidatedFinalEntries(input: {
  readonly fileBytes: Uint8Array;
  readonly variableKeyPrefix?: string;
}): {
  readonly parsedKeyCount: number;
  readonly issues: ImportPreflightIssue[];
  readonly finalEntries: readonly {
    variableKey: VariableKey;
    lineNumber: number;
    valueUtf8: Uint8Array;
  }[];
} {
  const prefix = validateVariableKeyPrefix(input.variableKeyPrefix);
  const parsed = parseDotenvImportFile(decodeImportFileUtf8(input.fileBytes));
  const issues: ImportPreflightIssue[] = parsed.parseIssues.map((issue) => ({
    lineNumber: issue.lineNumber,
    code: issue.code,
  }));
  const finalEntries: { variableKey: VariableKey; lineNumber: number; valueUtf8: Uint8Array }[] =
    [];

  for (const entry of parsed.entries) {
    const validated = validateDotenvImportEntry(entry, prefix);
    if (validated.issue !== undefined) {
      issues.push(validated.issue);
      continue;
    }
    if (validated.finalEntry !== undefined) {
      finalEntries.push(validated.finalEntry);
    }
  }

  return { parsedKeyCount: parsed.entries.length, issues, finalEntries };
}

export async function loadExistingSecretKeys(input: {
  readonly api: ApiClient;
  readonly host: string;
  readonly bearerCredential: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<{
  readonly existingShapeKeys: Set<VariableKey>;
  readonly existingSecretKeys: Set<VariableKey>;
}> {
  const secretsResult = await input.api.listProjectSecrets({
    host: input.host,
    bearerCredential: input.bearerCredential,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!secretsResult.ok) {
    throw cliErrorFromEnvelope(secretsResult.envelope);
  }

  const matrix: ListProjectSecretsData = secretsResult.envelope.data;
  return {
    existingShapeKeys: new Set(matrix.rows.map((row) => row.variableKey)),
    existingSecretKeys: existingSecretKeysForEnvironment(matrix.rows, input.environmentId),
  };
}

export function buildImportWritePlans(input: {
  readonly finalEntries: readonly {
    variableKey: VariableKey;
    lineNumber: number;
    valueUtf8: Uint8Array;
  }[];
  readonly duplicateKeys: readonly VariableKey[];
  readonly existingShapeKeys: Set<VariableKey>;
  readonly existingSecretKeys: Set<VariableKey>;
}): readonly ImportPreflightWritePlan[] {
  return input.finalEntries
    .filter((entry) => !input.duplicateKeys.includes(entry.variableKey))
    .filter((entry) => !input.existingSecretKeys.has(entry.variableKey))
    .map((entry) => ({
      variableKey: entry.variableKey,
      lineNumber: entry.lineNumber,
      createSecretShape: !input.existingShapeKeys.has(entry.variableKey),
      createSecret: true,
      valueUtf8: entry.valueUtf8,
    }));
}

export function primaryPreflightErrorCode(issues: readonly ImportPreflightIssue[]): KnownErrorCode {
  if (issues.some((issue) => issue.code === IMPORT_ERROR_CODES.existingSecret)) {
    return IMPORT_ERROR_CODES.existingSecret;
  }
  if (issues.some((issue) => issue.code === IMPORT_ERROR_CODES.duplicateVariableKey)) {
    return IMPORT_ERROR_CODES.duplicateVariableKey;
  }
  if (issues.some((issue) => issue.code === IMPORT_ERROR_CODES.parseError)) {
    return IMPORT_ERROR_CODES.parseError;
  }
  if (issues.some((issue) => issue.code === VALIDATION_ERROR_CODES.invalidVariableKey)) {
    return VALIDATION_ERROR_CODES.invalidVariableKey;
  }
  return issues[0]?.code ?? VALIDATION_ERROR_CODES.invalidCommandInput;
}
