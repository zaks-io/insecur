import type {
  CliProfileId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
} from "@insecur/domain";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { projectConfigPath, resolveProjectRoot } from "../config/paths.js";
import type { CliUserProfile } from "../config/user-config.js";
import { formatConfigShowHuman as formatConfigDetail } from "../output/config-detail.js";

interface ConfigShowProfile {
  readonly profileId: CliProfileId;
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly host: string;
  readonly orgId?: OrganizationId;
  readonly projectId: ProjectId;
  readonly envId: EnvironmentId;
  readonly defaultRunPolicyId?: RuntimePolicyId;
}

export interface ConfigShowData {
  readonly host: string;
  readonly orgId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly envId?: EnvironmentId;
  readonly profileId?: CliProfileId;
  readonly profileSlug?: string;
  readonly projectConfigPath?: string;
  readonly branchEnv: Readonly<Record<string, EnvironmentId>>;
  readonly profiles: readonly ConfigShowProfile[];
}

function toConfigShowProfile(profileId: CliProfileId, profile: CliUserProfile): ConfigShowProfile {
  return {
    profileId,
    slug: profile.slug,
    displayName: profile.displayName,
    host: profile.host,
    ...(profile.orgId === undefined ? {} : { orgId: profile.orgId }),
    projectId: profile.projectId,
    envId: profile.envId,
    ...(profile.defaultRunPolicyId === undefined
      ? {}
      : { defaultRunPolicyId: profile.defaultRunPolicyId }),
  };
}

function optionalScopeFields(scope: ResolvedCliContext["scope"]): Partial<ConfigShowData> {
  return {
    ...(scope.orgId === undefined ? {} : { orgId: scope.orgId }),
    ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
    ...(scope.envId === undefined ? {} : { envId: scope.envId }),
    ...(scope.profileId === undefined ? {} : { profileId: scope.profileId }),
    ...(scope.profileSlug === undefined ? {} : { profileSlug: scope.profileSlug }),
  };
}

export function buildConfigShowData(
  flags: { readonly configDir: string | undefined },
  context: ResolvedCliContext,
): ConfigShowData {
  const { scope, projectConfig, userConfig } = context;
  const projectRoot = resolveProjectRoot(flags.configDir);
  const profiles = Object.entries(userConfig.profiles).map(([profileId, profile]) =>
    toConfigShowProfile(profileId as CliProfileId, profile),
  );
  return {
    host: scope.host,
    ...optionalScopeFields(scope),
    ...(projectConfig === null ? {} : { projectConfigPath: projectConfigPath(projectRoot) }),
    branchEnv: projectConfig?.gitBranchToEnvironment ?? {},
    profiles,
  };
}

export function formatConfigShowHuman(data: ConfigShowData): string {
  return formatConfigDetail(data);
}
