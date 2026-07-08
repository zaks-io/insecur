import {
  AUTH_ERROR_CODES,
  CLI_ERROR_CODES,
  type ErrorRemediation,
  type KnownErrorCode,
  type MetadataEnvelopeMeta,
} from "@insecur/domain";

export const LOGIN_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login"],
};

export const LOGIN_SHELL_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login", "--shell"],
};

export const INIT_REMEDIATION: ErrorRemediation = {
  init: ["insecur", "init"],
};

/**
 * Static remediation the CLI can emit without server-provided envelope fields.
 * Lockstep-tested against docs/cli-and-sync.md remediation-required rows.
 */
export const CLI_REMEDIATION_BY_CODE: Partial<Record<KnownErrorCode, ErrorRemediation>> = {
  [AUTH_ERROR_CODES.required]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.expired]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.invalid]: LOGIN_REMEDIATION,
  [AUTH_ERROR_CODES.reauthRequired]: LOGIN_REMEDIATION,
  [CLI_ERROR_CODES.parentScopeUnresolved]: INIT_REMEDIATION,
};

export const CLI_REMEDIATION_SUPPLEMENT_CODES = new Set<KnownErrorCode>([
  AUTH_ERROR_CODES.highAssuranceRequired,
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

export function formatRemediationProse(remediation: ErrorRemediation): string {
  const lines: string[] = [];
  if (remediation.login !== undefined) {
    lines.push(`Run: ${remediation.login.join(" ")}`);
  }
  if (remediation.init !== undefined) {
    lines.push(`Run: ${remediation.init.join(" ")}`);
  }
  if (remediation.approvalUrl !== undefined) {
    lines.push(`Open approval URL: ${remediation.approvalUrl}`);
  }
  if (remediation.poll !== undefined) {
    lines.push(`Poll: ${remediation.poll.join(" ")}`);
  }
  if (remediation.resume !== undefined) {
    lines.push(`Resume: ${remediation.resume.join(" ")}`);
  }
  if (remediation.secretsSet !== undefined) {
    lines.push(`Set secret: ${remediation.secretsSet.join(" ")}`);
  }
  return lines.join("\n");
}
