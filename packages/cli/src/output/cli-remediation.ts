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

const LOGIN_DEVICE_REMEDIATION: ErrorRemediation = {
  login: ["insecur", "login", "--device"],
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
  [AUTH_ERROR_CODES.deviceAuthorizationExpired]: LOGIN_DEVICE_REMEDIATION,
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

function remediationCommandLines(remediation: ErrorRemediation): string[] {
  const lines: string[] = [];
  const commandFields: readonly {
    readonly value: readonly string[] | undefined;
    readonly label: string;
  }[] = [
    { value: remediation.login, label: "Run" },
    { value: remediation.init, label: "Run" },
    { value: remediation.migrate, label: "Migrate" },
    { value: remediation.hosted, label: "Hosted" },
    { value: remediation.poll, label: "Poll" },
    { value: remediation.resume, label: "Resume" },
    { value: remediation.secretsSet, label: "Set secret" },
  ];
  for (const field of commandFields) {
    if (field.value !== undefined) {
      lines.push(`${field.label}: ${field.value.join(" ")}`);
    }
  }
  return lines;
}

export function formatRemediationProse(remediation: ErrorRemediation): string {
  const lines = remediationCommandLines(remediation);
  if (remediation.approvalUrl !== undefined) {
    lines.push(`Open approval URL: ${remediation.approvalUrl}`);
  }
  return lines.join("\n");
}
