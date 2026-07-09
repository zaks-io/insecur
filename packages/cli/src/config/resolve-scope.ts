import type { CliProfileId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { LOCAL_MODE_ORGANIZATION_ID } from "@insecur/local-store";
import type { GlobalCliFlags } from "../cli-options.js";
import { isLocalModeHost } from "./local-mode.js";
import {
  parseOptionalEnvironmentId,
  parseOptionalOrganizationId,
  parseOptionalProjectId,
} from "./parse-resource-id.js";
import { resolveProfile } from "./profiles/resolve-profile.js";
import type { InsecurProjectConfig } from "./project-config.js";
import type { CliUserConfig, CliUserProfile } from "./user-config.js";

export interface ResolvedCliScope {
  readonly host: string;
  readonly orgId: OrganizationId | undefined;
  readonly projectId: ProjectId | undefined;
  readonly envId: EnvironmentId | undefined;
  readonly profileId: CliProfileId | undefined;
  readonly profileSlug: string | undefined;
  readonly profile: CliUserProfile | undefined;
}

const DEFAULT_HOST = "https://api.insecur.cloud";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}

function firstDefined<T>(...values: readonly (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function resolveCliScope(
  flags: GlobalCliFlags,
  projectConfig: InsecurProjectConfig | null,
  userConfig: CliUserConfig,
): ResolvedCliScope {
  const profileSlugInput = flags.profile ?? readEnv("INSECUR_PROFILE");
  const resolvedProfile = resolveProfile(userConfig, {
    ...(flags.profileId === undefined ? {} : { profileId: flags.profileId }),
    ...(profileSlugInput === undefined ? {} : { profileSlug: profileSlugInput }),
    ...(flags.profileId === undefined &&
    profileSlugInput === undefined &&
    projectConfig?.profileId !== undefined
      ? { profileId: projectConfig.profileId }
      : {}),
  });
  const profile = resolvedProfile?.profile;
  const host =
    firstDefined(flags.host, readEnv("INSECUR_HOST"), projectConfig?.host, profile?.host) ??
    DEFAULT_HOST;
  const orgId =
    flags.orgId ??
    parseOptionalOrganizationId(readEnv("INSECUR_ORG"), "INSECUR_ORG") ??
    projectConfig?.orgId ??
    profile?.orgId ??
    // Local Mode has no real organization; the fixed local org id keeps
    // org-scoped commands flowing to the local client (which answers
    // truthfully per capability) instead of dead-ending on "run insecur init"
    // in a project where init already ran.
    (isLocalModeHost(host) ? LOCAL_MODE_ORGANIZATION_ID : undefined);
  const projectId =
    flags.projectId ??
    parseOptionalProjectId(readEnv("INSECUR_PROJECT"), "INSECUR_PROJECT") ??
    projectConfig?.projectId ??
    profile?.projectId;
  const envId =
    flags.envId ??
    parseOptionalEnvironmentId(readEnv("INSECUR_ENV"), "INSECUR_ENV") ??
    projectConfig?.defaultEnvId ??
    profile?.envId;
  const profileId = firstDefined(flags.profileId, projectConfig?.profileId);
  const profileSlug = firstDefined(flags.profile, profile?.slug);
  return {
    host,
    orgId,
    projectId,
    envId,
    profileId,
    profileSlug,
    profile,
  };
}
