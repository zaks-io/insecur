import { CLI_ERROR_CODES, LOCAL_ERROR_CODES, errorEnvelope } from "@insecur/domain";
import {
  INSECURE_FILE_KEY_STORE_ENV,
  KEY_STORE_ERROR_CODES,
  KeyStoreError,
} from "@insecur/local-store";
import type { RenderFlags } from "../program-deps.js";
import { CliError } from "./cli-error.js";
import { actionableRemediation } from "./cli-remediation.js";
import { EXIT_UNEXPECTED } from "./exit-codes.js";
import { commanderUsageCliError, isCommanderUsageError } from "./commander-usage-error.js";
import { renderEnvelope } from "./render.js";
import { logUnexpectedCliErrorDebug, unexpectedCliErrorBody } from "./unexpected-cli-error.js";
import { CommanderError } from "commander";
import type { CliCrashReporter } from "../crash-reporting.js";

function renderCliError(error: CliError, flags: RenderFlags): number {
  const envelope =
    error.data === undefined
      ? error.toErrorEnvelope()
      : { ...error.toErrorEnvelope(), data: error.data };
  renderEnvelope(envelope, flags, () => "");
  return error.exitCode;
}

function keyStoreUnavailableCliError(error: unknown): CliError | null {
  if (!(error instanceof KeyStoreError) || error.code !== KEY_STORE_ERROR_CODES.unavailable) {
    return null;
  }
  return new CliError(
    {
      code: LOCAL_ERROR_CODES.keyStoreUnavailable,
      message: "A supported operating-system credential store is required.",
      retryable: false,
    },
    {
      remediation: actionableRemediation(LOCAL_ERROR_CODES.keyStoreUnavailable, {
        suggestedFix:
          `Install and unlock an OS credential store. On headless Linux, install secret-tool and provide a Secret Service session. ` +
          `For disposable development only, explicitly set ${INSECURE_FILE_KEY_STORE_ENV}=1; this stores the key beside local ciphertext and weakens backup separation.`,
      }),
    },
  );
}

async function renderUnexpectedFailure(
  error: unknown,
  flags: RenderFlags,
  crashReporter: CliCrashReporter,
): Promise<number> {
  logUnexpectedCliErrorDebug(error, flags.verbose);
  renderEnvelope(
    errorEnvelope(unexpectedCliErrorBody(error), {
      remediation: actionableRemediation(CLI_ERROR_CODES.unexpectedError, {
        suggestedFix: flags.verbose
          ? "This is a CLI bug; sanitized error context is printed above. Report it."
          : "Re-run the same command with --verbose to print sanitized error context.",
      }),
    }),
    flags,
    () => "",
  );
  await crashReporter.captureException(error, { source: "unexpected" });
  await crashReporter.flush(2_000);
  return EXIT_UNEXPECTED;
}

export async function renderCliRunFailure(
  error: unknown,
  flags: RenderFlags,
  crashReporter: CliCrashReporter,
): Promise<number> {
  if (isCommanderUsageError(error)) {
    const cliError = commanderUsageCliError(error);
    renderEnvelope(cliError.toErrorEnvelope(), flags, () => "");
    return cliError.exitCode;
  }
  if (error instanceof CommanderError && error.exitCode === 0) {
    return 0;
  }
  if (error instanceof CliError) {
    return renderCliError(error, flags);
  }
  const keyStoreError = keyStoreUnavailableCliError(error);
  if (keyStoreError !== null) {
    return renderCliError(keyStoreError, flags);
  }
  return renderUnexpectedFailure(error, flags, crashReporter);
}
