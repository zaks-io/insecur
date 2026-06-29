import type { CliProfileId } from "@insecur/domain";
import { CLI_SESSION_TOKEN_ENV, buildCliChildEnv } from "../auth/child-env.js";
import type { CliUserProfile } from "../config/user-config.js";

interface ShellChildEnvOptions {
  readonly env?: NodeJS.ProcessEnv;
}

export function buildLoginShellChildEnv(
  credential: string,
  host: string,
  options: ShellChildEnvOptions = {},
): NodeJS.ProcessEnv {
  return buildCliChildEnv({
    env: options.env,
    extraEnv: {
      [CLI_SESSION_TOKEN_ENV]: credential,
      INSECUR_HOST: host,
    },
  });
}

export function buildShellChildEnv(
  credential: string,
  profile: CliUserProfile,
  options: ShellChildEnvOptions = {},
): NodeJS.ProcessEnv {
  return buildCliChildEnv({
    env: options.env,
    extraEnv: {
      [CLI_SESSION_TOKEN_ENV]: credential,
      INSECUR_HOST: profile.host,
      INSECUR_ORG: profile.orgId,
      INSECUR_PROJECT: profile.projectId,
      INSECUR_ENV: profile.envId,
      INSECUR_PROFILE: profile.slug,
    },
  });
}

export function shellProfileSummary(profileId: CliProfileId, profile: CliUserProfile): string {
  return `Starting authenticated shell for profile ${profile.slug} (${profileId}).`;
}
