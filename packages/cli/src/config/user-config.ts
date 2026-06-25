import type {
  CliProfileId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import {
  parseCliProfileId,
  parseEnvironmentId,
  parseOrganizationId,
  parseProjectId,
} from "./parse-resource-id.js";
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
  const slug = requireNonEmptyString(record.slug, `profiles.${profileId}.slug`);
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

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
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
      throw new Error(`CLI profile slug already in use: ${profile.slug}`);
    }
  }
  profiles[profileId] = profile;
  const payload: Record<string, unknown> = { profiles };
  assertNoForbiddenConfigKeys(payload, "user config");
  await writeJsonFile(userConfigPath(), payload);
}
