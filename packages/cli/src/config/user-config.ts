import type {
  CliProfileId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
} from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import { isLocalModeHost } from "./local-mode.js";
import { parseCliProfileSlug } from "./profiles/profile-slug.js";
import {
  parseCliProfileId,
  parseEnvironmentId,
  parseOptionalRuntimePolicyId,
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
  readonly orgId?: OrganizationId;
  readonly projectId: ProjectId;
  readonly envId: EnvironmentId;
  readonly defaultRunPolicyId?: RuntimePolicyId;
}

export type CrashReportsPreference = "on" | "off";

export interface CliUserConfig {
  readonly crashReports?: CrashReportsPreference;
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
  const profileContext = `profiles.${profileId}`;
  const orgId = parseOptionalProfileOrgId(record.orgId, host, profileContext);
  const projectId = requireNonEmptyString(record.projectId, `profiles.${profileId}.projectId`);
  const envId = requireNonEmptyString(record.envId, `profiles.${profileId}.envId`);
  const defaultRunPolicyId = parseOptionalRuntimePolicyId(
    typeof record.defaultRunPolicyId === "string" ? record.defaultRunPolicyId : undefined,
    `${profileContext}.defaultRunPolicyId`,
  );
  return {
    slug,
    displayName: displayName as DisplayName,
    host,
    ...(orgId === undefined ? {} : { orgId }),
    projectId: parseProjectId(projectId, `${profileContext}.projectId`),
    envId: parseEnvironmentId(envId, `${profileContext}.envId`),
    ...(defaultRunPolicyId === undefined ? {} : { defaultRunPolicyId }),
  };
}

function parseOptionalProfileOrgId(
  value: unknown,
  host: string,
  profileContext: string,
): OrganizationId | undefined {
  if (value === undefined) {
    if (!isLocalModeHost(host)) {
      throw new Error(`${profileContext}.orgId is required for hosted profiles`);
    }
    return undefined;
  }
  return parseOrganizationId(
    requireNonEmptyString(value, `${profileContext}.orgId`),
    `${profileContext}.orgId`,
  );
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

function parseCrashReportsPreference(value: unknown): CrashReportsPreference | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "on" || value === "off") {
    return value;
  }
  throw new Error("user config crashReports must be on or off");
}

function parseUserConfig(record: Record<string, unknown>): CliUserConfig {
  assertNoForbiddenConfigKeys(record, "user config");
  const crashReports = parseCrashReportsPreference(record.crashReports);
  return {
    ...(crashReports === undefined ? {} : { crashReports }),
    profiles: parseProfilesRecord(record.profiles),
  };
}

export async function loadUserConfig(): Promise<CliUserConfig> {
  const record = await readJsonFile(userConfigPath());
  if (record === null) {
    return { profiles: {} };
  }
  return parseUserConfig(record);
}

export async function setCrashReportsPreference(preference: CrashReportsPreference): Promise<void> {
  const existing = await loadUserConfig();
  const payload: Record<string, unknown> = { ...existing, crashReports: preference };
  assertNoForbiddenConfigKeys(payload, "user config");
  await writeJsonFile(userConfigPath(), payload, { mode: 0o600 });
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
  const payload: Record<string, unknown> = { ...existing, profiles };
  assertNoForbiddenConfigKeys(payload, "user config");
  await writeJsonFile(userConfigPath(), payload, { mode: 0o600 });
}
