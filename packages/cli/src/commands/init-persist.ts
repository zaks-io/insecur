import { cliProfileId, type CliProfileId, type DisplayName } from "@insecur/domain";
import type { GuidedOrganizationProvisionData } from "../api/types.js";
import { writeProjectConfig, type InsecurProjectConfig } from "../config/project-config.js";
import { upsertUserProfile } from "../config/user-config.js";

export async function persistInitConfig(input: {
  readonly configDir: string | undefined;
  readonly host: string;
  readonly profileSlug: string;
  readonly profileDisplayName: DisplayName;
  readonly data: GuidedOrganizationProvisionData;
}): Promise<{ configPath: string; profileId: CliProfileId }> {
  const profileId = cliProfileId.generate();
  await upsertUserProfile(profileId, {
    slug: input.profileSlug,
    displayName: input.profileDisplayName,
    host: input.host,
    orgId: input.data.organizationId,
    projectId: input.data.projectId,
    envId: input.data.developmentEnvironmentId,
  });
  const projectConfig: InsecurProjectConfig = {
    host: input.host,
    orgId: input.data.organizationId,
    projectId: input.data.projectId,
    defaultEnvId: input.data.developmentEnvironmentId,
    profileId,
  };
  const configPath = await writeProjectConfig(input.configDir, projectConfig);
  return { configPath, profileId };
}
