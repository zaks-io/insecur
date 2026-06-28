import type { CliProfileId } from "@insecur/domain";
import { CLI_SESSION_TOKEN_ENV, scrubCliChildAuthEnv } from "../auth/child-env.js";
import type { CliUserProfile } from "../config/user-config.js";

export function buildLoginShellChildEnv(credential: string, host: string): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...scrubCliChildAuthEnv({ allow: [CLI_SESSION_TOKEN_ENV] }),
    [CLI_SESSION_TOKEN_ENV]: credential,
    INSECUR_HOST: host,
  };
  return childEnv;
}

export function buildShellChildEnv(credential: string, profile: CliUserProfile): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...scrubCliChildAuthEnv({ allow: [CLI_SESSION_TOKEN_ENV] }),
    [CLI_SESSION_TOKEN_ENV]: credential,
    INSECUR_HOST: profile.host,
    INSECUR_ORG: profile.orgId,
    INSECUR_PROJECT: profile.projectId,
    INSECUR_ENV: profile.envId,
    INSECUR_PROFILE: profile.slug,
  };
  return childEnv;
}

export function shellProfileSummary(profileId: CliProfileId, profile: CliUserProfile): string {
  return `Starting authenticated shell for profile ${profile.slug} (${profileId}).`;
}
