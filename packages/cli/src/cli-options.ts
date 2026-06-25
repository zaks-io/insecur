import type { CliProfileId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  parseOptionalCliProfileId,
  parseOptionalEnvironmentId,
  parseOptionalOrganizationId,
  parseOptionalProjectId,
} from "./config/parse-resource-id.js";

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
      orgId: parseOptionalOrganizationId(options.orgId, "--org-id"),
      projectId: parseOptionalProjectId(options.projectId, "--project-id"),
      envId: parseOptionalEnvironmentId(options.envId, "--env-id"),
      profile: options.profile,
      profileId: parseOptionalCliProfileId(options.profileId, "--profile-id"),
      configDir: options.configDir,
      json: options.json === true,
      quiet: options.quiet === true,
      verbose: options.verbose === true,
    },
  };
}
