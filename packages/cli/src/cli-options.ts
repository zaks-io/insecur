import type { CliProfileId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

export interface GlobalCliFlags {
  readonly host: string | undefined;
  readonly orgId: OrganizationId | undefined;
  readonly projectId: ProjectId | undefined;
  readonly envId: EnvironmentId | undefined;
  readonly profile: string | undefined;
  readonly profileId: CliProfileId | undefined;
  readonly configDir: string | undefined;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
}

export interface ParsedGlobalOptions {
  readonly flags: GlobalCliFlags;
}

export function parseGlobalOptions(options: {
  host?: string;
  orgId?: string;
  projectId?: string;
  envId?: string;
  profile?: string;
  profileId?: string;
  configDir?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}): ParsedGlobalOptions {
  return {
    flags: {
      host: options.host,
      orgId: options.orgId as OrganizationId | undefined,
      projectId: options.projectId as ProjectId | undefined,
      envId: options.envId as EnvironmentId | undefined,
      profile: options.profile,
      profileId: options.profileId as CliProfileId | undefined,
      configDir: options.configDir,
      json: options.json === true,
      quiet: options.quiet === true,
      verbose: options.verbose === true,
    },
  };
}
