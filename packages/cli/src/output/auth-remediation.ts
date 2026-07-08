import { AUTH_ERROR_CODES, assertMetadataOnlyValue } from "@insecur/domain";
import { errorEnvelope } from "@insecur/domain";
import type { RenderOptions } from "./render.js";
import { LOGIN_SHELL_REMEDIATION } from "./cli-remediation.js";
import { renderEnvelope } from "./render.js";

function authRequiredWhoamiMessage(): string {
  return "Authentication is required. Have your human run: insecur login --shell";
}

export function authRequiredWhoamiEnvelope() {
  return errorEnvelope(
    {
      code: AUTH_ERROR_CODES.required,
      message: authRequiredWhoamiMessage(),
      retryable: false,
    },
    { remediation: LOGIN_SHELL_REMEDIATION },
  );
}

export function renderAuthRemediationEnvelope(
  envelope: ReturnType<typeof authRequiredWhoamiEnvelope>,
  options: RenderOptions,
): void {
  assertMetadataOnlyValue(envelope);
  renderEnvelope(envelope, options, () => "");
}
