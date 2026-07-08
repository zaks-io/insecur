import { parseDisplayName, successEnvelope, type DisplayName } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseCliProfileSlug } from "../config/profiles/profile-slug.js";
import { LOCAL_INIT_NOTICE } from "../local/local-init-notice.js";
import {
  provisionLocalProject,
  type LocalInitProvisionData,
  type ProvisionLocalProjectOptions,
} from "../local/provision-local-project.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { createLocalInitProfileId, persistLocalInitConfig } from "./init-local-persist.js";
import { buildLocalInitResolvedTargets } from "./init-result.js";

function displayNameOrThrow(label: string, raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`${label} display name is invalid: ${raw}`);
  }
  return parsed.value;
}

const LOCAL_INIT_LABELS = {
  project: displayNameOrThrow("project", "First project"),
  environment: displayNameOrThrow("environment", "Development"),
  profile: displayNameOrThrow("profile", "Local development"),
};

export interface LocalInitCommandOptions {
  readonly profileSlug: string;
  readonly provision?: ProvisionLocalProjectOptions;
  readonly mintProfileId?: () => ReturnType<typeof createLocalInitProfileId>;
}

export async function runLocalInitCommand(
  flags: GlobalCliFlags,
  commandOptions: LocalInitCommandOptions,
): Promise<number> {
  const profileSlug = parseCliProfileSlug(commandOptions.profileSlug, "--profile-slug");
  const profileId = commandOptions.mintProfileId?.() ?? createLocalInitProfileId();
  const provisioned = await provisionLocalProject(commandOptions.provision);
  try {
    const { configPath } = await persistLocalInitConfig({
      configDir: flags.configDir,
      profileSlug,
      profileDisplayName: LOCAL_INIT_LABELS.profile,
      profileId,
      data: provisioned.data,
    });
    renderLocalInitSuccess(flags, {
      configPath,
      data: provisioned.data,
      profileId,
      profileSlug,
    });
    return 0;
  } finally {
    provisioned.localStore.close();
  }
}

function renderLocalInitSuccess(
  flags: GlobalCliFlags,
  input: {
    readonly configPath: string;
    readonly data: LocalInitProvisionData;
    readonly profileId: ReturnType<typeof createLocalInitProfileId>;
    readonly profileSlug: string;
  },
): void {
  const output = successEnvelope(
    {
      configPath: input.configPath,
      projectId: input.data.projectId,
      environmentId: input.data.developmentEnvironmentId,
      profileId: input.profileId,
      profileSlug: input.profileSlug,
      notice: LOCAL_INIT_NOTICE,
    },
    buildEnvelopeMeta({
      resolvedTargets: buildLocalInitResolvedTargets(
        input.data,
        input.profileId,
        input.profileSlug,
        LOCAL_INIT_LABELS,
      ),
    }),
  );
  renderSuccess(
    output,
    flags,
    () =>
      `${LOCAL_INIT_NOTICE} Wrote ${input.configPath} with project, environment, profile, and secret shape defaults.`,
  );
}
