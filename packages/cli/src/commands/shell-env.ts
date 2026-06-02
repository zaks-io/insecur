import type { CliProfileId } from "@insecur/domain";
import type { CliUserProfile } from "../config/user-config.js";

export function buildShellChildEnv(credential: string, profile: CliUserProfile): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    INSECUR_SESSION_TOKEN: credential,
    INSECUR_HOST: profile.host,
    INSECUR_ORG: profile.orgId,
    INSECUR_PROJECT: profile.projectId,
    INSECUR_ENV: profile.envId,
    INSECUR_PROFILE: profile.slug,
  };
  delete childEnv.INSECUR_DEPLOY_KEY;
  delete childEnv.INSECUR_OIDC_TOKEN;
  return childEnv;
}

export function shellProfileSummary(profileId: CliProfileId, profile: CliUserProfile): string {
  return `Starting authenticated shell for profile ${profile.slug} (${profileId}).`;
}
