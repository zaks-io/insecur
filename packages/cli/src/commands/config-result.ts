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
  readonly crashReports: "on" | "off";
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
    crashReports: userConfig.crashReports ?? "on",
    branchEnv: projectConfig?.gitBranchToEnvironment ?? {},
    profiles,
  };
}

function formatOptionalLine(label: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`${label}: ${value}`];
}

export function formatConfigShowHuman(data: ConfigShowData): string {
  const lines = [
    `host: ${data.host}`,
    ...formatOptionalLine("orgId", data.orgId),
    ...formatOptionalLine("projectId", data.projectId),
    ...formatOptionalLine("envId", data.envId),
    ...formatOptionalLine("profileId", data.profileId),
    ...formatOptionalLine("profileSlug", data.profileSlug),
    ...formatOptionalLine("projectConfigPath", data.projectConfigPath),
    `crashReports: ${data.crashReports}`,
  ];
  const branchEntries = Object.entries(data.branchEnv);
  if (branchEntries.length > 0) {
    lines.push("branchEnv:");
    for (const [branch, envId] of branchEntries) {
      lines.push(`  ${branch}: ${envId}`);
    }
  }
  if (data.profiles.length > 0) {
    lines.push(`profiles: ${String(data.profiles.length)}`);
    for (const profile of data.profiles) {
      lines.push(`  ${profile.slug} (${profile.profileId})`);
    }
  }
  return lines.join("\n");
}
