import { successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { resolveProfile } from "../config/profiles/resolve-profile.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId } from "../output/target-echo.js";
import { buildShellChildEnv, shellProfileSummary } from "./shell-env.js";
import { resolveInteractiveShell, runInteractiveShell } from "./managed-shell.js";

export async function runShellCommand(
  flags: GlobalCliFlags,
  profileSelector: string,
  context: ResolvedCliContext,
): Promise<number> {
  const credential = requireSessionCredential();
  const { profileId, profile } = resolveProfile(
    context.userConfig,
    { selector: profileSelector },
    { required: true },
  );
  const { host } = context.scope;
  const resolvedTargets: ResolvedTargetEcho[] = [
    {
      type: "cli_profile",
      id: asEchoId(profileId),
      slug: profile.slug,
      displayName: profile.displayName,
    },
  ];
  if (flags.json) {
    renderSuccess(
      successEnvelope({ profileId, profileSlug: profile.slug, host }, { resolvedTargets }),
      flags,
      () => "",
    );
    return 0;
  }
  if (!flags.quiet) {
    process.stdout.write(`${shellProfileSummary(profileId, profile)}\n`);
  }
  return runInteractiveShell(resolveInteractiveShell(), buildShellChildEnv(credential, profile));
}
