import type {
  CliProfileId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import { readJsonFile, userConfigPath, writeJsonFile } from "./paths.js";

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
  const slug = record.slug;
  const displayName = record.displayName;
  const host = record.host;
  const orgId = record.orgId;
  const projectId = record.projectId;
  const envId = record.envId;
  for (const [field, value] of [
    ["slug", slug],
    ["displayName", displayName],
    ["host", host],
    ["orgId", orgId],
    ["projectId", projectId],
    ["envId", envId],
  ] as const) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`profiles.${profileId}.${field} must be a non-empty string`);
    }
  }
  return {
    slug: slug as string,
    displayName: displayName as DisplayName,
    host: host as string,
    orgId: orgId as OrganizationId,
    projectId: projectId as ProjectId,
    envId: envId as EnvironmentId,
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
    profiles[profileId as CliProfileId] = parseProfileRecord(profileId, profileRecord);
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
      throw new Error(`CLI profile slug already in use: ${profile.slug}`);
    }
  }
  profiles[profileId] = profile;
  const payload: Record<string, unknown> = { profiles };
  assertNoForbiddenConfigKeys(payload, "user config");
  await writeJsonFile(userConfigPath(), payload);
}
