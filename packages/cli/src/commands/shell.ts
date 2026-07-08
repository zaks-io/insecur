import { CLI_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { resolveProfile } from "../config/profiles/resolve-profile.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import { buildShellChildEnv, shellProfileSummary } from "./shell-env.js";
import { resolveInteractiveShell, runInteractiveShell } from "./managed-shell.js";

function assertShellJsonCompatible(flags: GlobalCliFlags): void {
  if (flags.json) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.validationError,
        message: "insecur shell cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

export async function runShellCommand(
  flags: GlobalCliFlags,
  profileSelector: string,
  context: ResolvedCliContext,
): Promise<number> {
  assertShellJsonCompatible(flags);
  const { profileId, profile } = resolveProfile(
    context.userConfig,
    { selector: profileSelector },
    { required: true },
  );
  const { host } = profile;
  const credential = await requireSessionCredential(host);
  if (!flags.quiet) {
    process.stdout.write(`${shellProfileSummary(profileId, profile)}\n`);
  }
  return runInteractiveShell(resolveInteractiveShell(), buildShellChildEnv(credential, profile));
}
