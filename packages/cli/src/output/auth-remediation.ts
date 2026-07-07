import { assertMetadataOnlyValue, AUTH_ERROR_CODES, type ErrorBody } from "@insecur/domain";
import type { RenderOptions } from "./render.js";

interface AuthRemediation {
  readonly login: readonly string[];
}

interface AuthRemediationEnvelope {
  readonly ok: false;
  readonly error: ErrorBody;
  readonly remediation: AuthRemediation;
}

const WHOAMI_AUTH_REMEDIATION: AuthRemediation = {
  login: ["insecur", "login", "--shell"],
};

function authRequiredWhoamiMessage(): string {
  return "Authentication is required. Have your human run: insecur login --shell";
}

export function authRequiredWhoamiEnvelope(): AuthRemediationEnvelope {
  const envelope: AuthRemediationEnvelope = {
    ok: false,
    error: {
      code: AUTH_ERROR_CODES.required,
      message: authRequiredWhoamiMessage(),
      retryable: false,
    },
    remediation: WHOAMI_AUTH_REMEDIATION,
  };
  assertMetadataOnlyValue(envelope);
  return envelope;
}

export function renderAuthRemediationEnvelope(
  envelope: AuthRemediationEnvelope,
  options: RenderOptions,
): void {
  assertMetadataOnlyValue(envelope);
  if (options.json) {
    process.stderr.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (!options.quiet) {
    process.stderr.write(`${envelope.error.message}\n`);
  }
}
