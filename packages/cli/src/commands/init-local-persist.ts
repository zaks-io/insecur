import { cliProfileId, type CliProfileId, type DisplayName } from "@insecur/domain";
import { LOCAL_MODE_HOST } from "../config/local-mode.js";
import { writeProjectConfig, type InsecurProjectConfig } from "../config/project-config.js";
import { upsertUserProfile } from "../config/user-config.js";
import type { LocalInitProvisionData } from "../local/provision-local-project.js";

export async function persistLocalInitConfig(input: {
  readonly configDir: string | undefined;
  readonly profileSlug: string;
  readonly profileDisplayName: DisplayName;
  readonly profileId: CliProfileId;
  readonly data: LocalInitProvisionData;
}): Promise<{ configPath: string; profileId: CliProfileId }> {
  await upsertUserProfile(input.profileId, {
    slug: input.profileSlug,
    displayName: input.profileDisplayName,
    host: LOCAL_MODE_HOST,
    projectId: input.data.projectId,
    envId: input.data.developmentEnvironmentId,
  });
  const projectConfig: InsecurProjectConfig = {
    host: LOCAL_MODE_HOST,
    projectId: input.data.projectId,
    defaultEnvId: input.data.developmentEnvironmentId,
    profileId: input.profileId,
    secretShapes: input.data.secretShapes,
  };
  const configPath = await writeProjectConfig(input.configDir, projectConfig);
  return { configPath, profileId: input.profileId };
}

export function createLocalInitProfileId(): CliProfileId {
  return cliProfileId.generate();
}
