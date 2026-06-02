import { spawn } from "node:child_process";
import { successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { loadProjectConfig } from "../config/project-config.js";
import { loadUserConfig } from "../config/user-config.js";
import { resolveCliScope } from "../config/resolve-scope.js";
import { resolveProfileSelector } from "../profiles/resolve-profile.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId } from "../output/target-echo.js";
import { buildShellChildEnv, shellProfileSummary } from "./shell-env.js";

function runInteractiveShell(shell: string, childEnv: NodeJS.ProcessEnv): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(shell, [], { env: childEnv, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 0);
    });
  });
}

export async function runShellCommand(
  flags: GlobalCliFlags,
  profileSelector: string,
): Promise<number> {
  const credential = requireSessionCredential();
  const userConfig = await loadUserConfig();
  const { profileId, profile } = resolveProfileSelector(profileSelector, userConfig);
  const scope = resolveCliScope(flags, await loadProjectConfig(flags.configDir), userConfig);
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
      successEnvelope(
        { profileId, profileSlug: profile.slug, host: scope.host },
        { resolvedTargets },
      ),
      flags,
      () => "",
    );
    return 0;
  }
  if (!flags.quiet) {
    process.stdout.write(`${shellProfileSummary(profileId, profile)}\n`);
  }
  const shell = process.env.SHELL ?? "/bin/bash";
  return runInteractiveShell(shell, buildShellChildEnv(credential, profile));
}
