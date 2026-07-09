import {
  AUTH_ERROR_CODES,
  CLI_ERROR_CODES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  type ErrorRemediation,
  type KnownErrorCode,
  type MetadataEnvelopeMeta,
} from "@insecur/domain";
import { errorTypeUri } from "./error-type-uri.js";
import { remediationStep } from "./format.js";
import { getStyle } from "./style.js";

export const LOGIN_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login"],
};

export const LOGIN_SHELL_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login", "--shell"],
};

export const INIT_REMEDIATION: ErrorRemediation = {
  init: ["insecur", "init"],
};

const LOGIN_DEVICE_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login", "--device"],
};

/**
 * Build an RFC 9457-shaped remediation: a stable per-code `type` URI plus the
 * plain-language fix and exact next command. Used for the client-side failures
 * an agent hits most (bad args, missing secret input) so `--json` callers get a
 * structured, copy-pasteable recovery instead of prose to NLP-parse.
 */
export function actionableRemediation(
  code: KnownErrorCode,
  parts: { readonly suggestedFix: string; readonly usage?: readonly string[] },
): ErrorRemediation {
  return {
    type: errorTypeUri(code),
    suggestedFix: parts.suggestedFix,
    ...(parts.usage !== undefined ? { usage: parts.usage } : {}),
  };
}

/**
 * Static remediation the CLI can emit without server-provided envelope fields.
 * Lockstep-tested against docs/cli-and-sync.md remediation-required rows.
 */
export const CLI_REMEDIATION_BY_CODE: Partial<Record<KnownErrorCode, ErrorRemediation>> = {
  [AUTH_ERROR_CODES.required]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.expired]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.invalid]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.reauthRequired]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.deviceAuthorizationExpired]: LOGIN_DEVICE_REMEDIATION,
  [CLI_ERROR_CODES.parentScopeUnresolved]: INIT_REMEDIATION,
};

export const CLI_REMEDIATION_SUPPLEMENT_CODES = new Set<KnownErrorCode>([
  AUTH_ERROR_CODES.highAssuranceRequired,
  CLI_ERROR_CODES.unexpectedError,
  CLI_ERROR_CODES.validationError,
  SECRET_ERROR_CODES.inputRequired,
  VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
]);

function remediationForCliCode(code: KnownErrorCode): ErrorRemediation | undefined {
  return CLI_REMEDIATION_BY_CODE[code];
}

function supplementRemediationFromMeta(
  code: KnownErrorCode,
  meta: MetadataEnvelopeMeta | undefined,
  existing: ErrorRemediation | undefined,
): ErrorRemediation | undefined {
  if (existing !== undefined) {
    return existing;
  }
  if (code !== AUTH_ERROR_CODES.highAssuranceRequired) {
    return undefined;
  }
  const operationId = meta?.operationId;
  if (operationId === undefined) {
    return undefined;
  }
  return {
    poll: ["insecur", "operations", "wait", operationId, "--json"],
  };
}

export function resolveCliRemediation(
  code: KnownErrorCode,
  meta: MetadataEnvelopeMeta | undefined,
  envelopeRemediation: ErrorRemediation | undefined,
): ErrorRemediation | undefined {
  return (
    envelopeRemediation ??
    supplementRemediationFromMeta(code, meta, undefined) ??
    remediationForCliCode(code)
  );
}

function remediationCommandLines(remediation: ErrorRemediation): string[] {
  const lines: string[] = [];
  const commandFields: readonly {
    readonly value: readonly string[] | undefined;
    readonly connective: string;
  }[] = [
    // The exact retry (`usage`) leads: it belongs to the suggestedFix line
    // directly above it, ahead of the alternative-path commands.
    { value: remediation.usage, connective: "Try" },
    { value: remediation.login, connective: "Run" },
    { value: remediation.init, connective: "Run" },
    { value: remediation.migrate, connective: "Migrate" },
    { value: remediation.hosted, connective: "Hosted" },
    { value: remediation.poll, connective: "Poll" },
    { value: remediation.resume, connective: "Resume" },
    { value: remediation.secretsSet, connective: "Set secret" },
  ];
  for (const field of commandFields) {
    if (field.value !== undefined) {
      lines.push(remediationStep(field.connective, field.value.join(" ")));
    }
  }
  return lines;
}

export function formatRemediationProse(remediation: ErrorRemediation): string {
  const s = getStyle();
  const lines: string[] = [];
  if (remediation.suggestedFix !== undefined) {
    lines.push(`  ${s.meta(s.glyph("arrow"))} ${s.meta(remediation.suggestedFix)}`);
  }
  lines.push(...remediationCommandLines(remediation));
  if (remediation.approvalUrl !== undefined) {
    lines.push(
      `  ${s.meta(s.glyph("arrow"))} ${s.meta("Open approval URL:")} ${s.action(remediation.approvalUrl)}`,
    );
  }
  return lines.join("\n");
}
