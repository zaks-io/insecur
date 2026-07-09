import { detectHarnessFromEnv } from "@insecur/agent-attribution";
import { AUTH_ERROR_CODES, assertMetadataOnlyValue } from "@insecur/domain";
import { errorEnvelope } from "@insecur/domain";
import type { RenderOptions } from "./render.js";
import { LOGIN_REMEDIATION, LOGIN_SHELL_REMEDIATION } from "./cli-remediation.js";
import { renderEnvelope } from "./render.js";

/**
 * Agents cannot complete the interactive login, so a detected harness is told
 * to hand off to its human; a human at a plain terminal is told to log in.
 */
export function authRequiredWhoamiEnvelope(env: NodeJS.ProcessEnv = process.env) {
  const agentHarness = detectHarnessFromEnv(env) !== undefined;
  return errorEnvelope(
    {
      code: AUTH_ERROR_CODES.required,
      message: agentHarness
        ? "Authentication is required. Have your human run: insecur login --shell"
        : "Authentication is required. Run insecur login first.",
      retryable: false,
    },
    { remediation: agentHarness ? LOGIN_SHELL_REMEDIATION : LOGIN_REMEDIATION },
  );
}

export function renderAuthRemediationEnvelope(
  envelope: ReturnType<typeof authRequiredWhoamiEnvelope>,
  options: RenderOptions,
): void {
  assertMetadataOnlyValue(envelope);
  renderEnvelope(envelope, options, () => "");
}
