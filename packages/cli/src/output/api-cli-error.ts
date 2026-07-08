import type { ErrorEnvelope } from "@insecur/domain";
import { CliError } from "./cli-error.js";
import { resolveCliRemediation } from "./cli-remediation.js";

export function cliErrorFromEnvelope(envelope: ErrorEnvelope): CliError {
  const remediation = resolveCliRemediation(
    envelope.error.code,
    envelope.meta,
    envelope.remediation,
  );
  return new CliError(envelope.error, {
    ...(envelope.meta !== undefined ? { meta: envelope.meta } : {}),
    ...(remediation !== undefined ? { remediation } : {}),
  });
}
