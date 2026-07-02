import type {
  CliProfileId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import { parseCliProfileSlug } from "./profiles/profile-slug.js";
import {
  parseCliProfileId,
  parseEnvironmentId,
  parseOrganizationId,
  parseProjectId,
} from "./parse-resource-id.js";
import { requireNonEmptyString } from "./require-non-empty-string.js";
import { readJsonFile, userConfigPath, writeJsonFile } from "./paths.js";
import { CliError } from "../output/cli-error.js";

export interface CliUserProfile {
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly host: string;
  readonly orgId: OrganizationId;
  readonly projectId: ProjectId;
  readonly envId: EnvironmentId;
}

export interface CliUserConfig {
  readonly profiles: Readonly<Record<CliProfileId, CliUserProfile>>;
}

function parseProfile(profileId: string, record: Record<string, unknown>): CliUserProfile {
  assertNoForbiddenConfigKeys(record, `profiles.${profileId}`);
  const slug = parseCliProfileSlug(
    requireNonEmptyString(record.slug, `profiles.${profileId}.slug`),
    `profiles.${profileId}.slug`,
  );
  const displayName = requireNonEmptyString(
    record.displayName,
    `profiles.${profileId}.displayName`,
  );
  const host = requireNonEmptyString(record.host, `profiles.${profileId}.host`);
  const orgId = requireNonEmptyString(record.orgId, `profiles.${profileId}.orgId`);
  const projectId = requireNonEmptyString(record.projectId, `profiles.${profileId}.projectId`);
  const envId = requireNonEmptyString(record.envId, `profiles.${profileId}.envId`);
  const profileContext = `profiles.${profileId}`;
  return {
    slug,
    displayName: displayName as DisplayName,
    host,
    orgId: parseOrganizationId(orgId, `${profileContext}.orgId`),
    projectId: parseProjectId(projectId, `${profileContext}.projectId`),
    envId: parseEnvironmentId(envId, `${profileContext}.envId`),
  };
}

function parseProfileRecord(profileId: string, profileRecord: unknown): CliUserProfile {
  if (profileRecord === null || typeof profileRecord !== "object" || Array.isArray(profileRecord)) {
    throw new Error(`profiles.${profileId} must be an object`);
  }
  return parseProfile(profileId, profileRecord as Record<string, unknown>);
}

function parseProfilesRecord(profilesRaw: unknown): Record<CliProfileId, CliUserProfile> {
  if (
    profilesRaw === undefined ||
    profilesRaw === null ||
    typeof profilesRaw !== "object" ||
    Array.isArray(profilesRaw)
  ) {
    return {};
  }
  const profiles: Record<CliProfileId, CliUserProfile> = {};
  for (const [profileId, profileRecord] of Object.entries(profilesRaw as Record<string, unknown>)) {
    const parsedProfileId = parseCliProfileId(profileId, `profiles.${profileId}`);
    profiles[parsedProfileId] = parseProfileRecord(profileId, profileRecord);
  }
  return profiles;
}

function parseUserConfig(record: Record<string, unknown>): CliUserConfig {
  assertNoForbiddenConfigKeys(record, "user config");
  return { profiles: parseProfilesRecord(record.profiles) };
}

export async function loadUserConfig(): Promise<CliUserConfig> {
  const record = await readJsonFile(userConfigPath());
  if (record === null) {
    return { profiles: {} };
  }
  return parseUserConfig(record);
}

export async function upsertUserProfile(
  profileId: CliProfileId,
  profile: CliUserProfile,
): Promise<void> {
  const existing = await loadUserConfig();
  const profiles: Record<string, CliUserProfile> = { ...existing.profiles };
  for (const [id, existingProfile] of Object.entries(profiles)) {
    if (id !== profileId && existingProfile.slug === profile.slug) {
      throw new CliError({
        code: CLI_ERROR_CODES.profileSlugInUse,
        message: `CLI profile slug already in use: ${profile.slug}`,
        retryable: false,
      });
    }
  }
  profiles[profileId] = profile;
  const payload: Record<string, unknown> = { profiles };
  assertNoForbiddenConfigKeys(payload, "user config");
  await writeJsonFile(userConfigPath(), payload);
}
