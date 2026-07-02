import type { CliProfileId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import type { CliUserConfig, CliUserProfile } from "../user-config.js";
import { parseCliProfileId } from "../parse-resource-id.js";
import { parseCliProfileSlug } from "./profile-slug.js";
import { CliError } from "../../output/cli-error.js";
import { EXIT_NOT_FOUND } from "../../output/exit-codes.js";

export interface ResolveProfileInput {
  readonly profileId?: CliProfileId;
  readonly profileSlug?: string;
  readonly selector?: string;
}

export interface ResolvedProfile {
  readonly profileId: CliProfileId;
  readonly profile: CliUserProfile;
}

function profileNotFoundMessage(input: ResolveProfileInput): string {
  if (input.profileId !== undefined) {
    return `CLI profile not found: ${input.profileId}`;
  }
  const slugOrSelector = input.selector ?? input.profileSlug;
  if (slugOrSelector?.startsWith("prof_") === true) {
    return `CLI profile not found: ${slugOrSelector}`;
  }
  return `CLI profile not found for slug: ${slugOrSelector ?? "profile"}`;
}

function throwProfileNotFound(input: ResolveProfileInput): never {
  throw new CliError(
    {
      code: CLI_ERROR_CODES.profileNotFound,
      message: profileNotFoundMessage(input),
      retryable: false,
    },
    EXIT_NOT_FOUND,
  );
}

function lookupById(
  userConfig: CliUserConfig,
  profileId: CliProfileId,
): ResolvedProfile | undefined {
  const profile = userConfig.profiles[profileId];
  if (profile === undefined) {
    return undefined;
  }
  return { profileId, profile };
}

function lookupBySlugOrSelector(
  userConfig: CliUserConfig,
  slugOrSelector: string,
): ResolvedProfile | undefined {
  if (slugOrSelector.startsWith("prof_")) {
    return lookupById(userConfig, parseCliProfileId(slugOrSelector, "--profile"));
  }
  const slug = parseCliProfileSlug(slugOrSelector, "--profile");
  const match = Object.entries(userConfig.profiles).find(([, profile]) => profile.slug === slug);
  if (match === undefined) {
    return undefined;
  }
  return { profileId: parseCliProfileId(match[0], "--profile"), profile: match[1] };
}

function resolveProfileOptional(
  userConfig: CliUserConfig,
  input: ResolveProfileInput,
): ResolvedProfile | undefined {
  if (input.profileId !== undefined) {
    return lookupById(userConfig, input.profileId);
  }
  const slugOrSelector = input.profileSlug ?? input.selector;
  if (slugOrSelector === undefined) {
    return undefined;
  }
  return lookupBySlugOrSelector(userConfig, slugOrSelector);
}

export function resolveProfile(
  userConfig: CliUserConfig,
  input: ResolveProfileInput,
  options: { readonly required: true },
): ResolvedProfile;
export function resolveProfile(
  userConfig: CliUserConfig,
  input: ResolveProfileInput,
  options?: { readonly required?: boolean },
): ResolvedProfile | undefined;
export function resolveProfile(
  userConfig: CliUserConfig,
  input: ResolveProfileInput,
  options?: { readonly required?: boolean },
): ResolvedProfile | undefined {
  const resolved = resolveProfileOptional(userConfig, input);
  if (resolved !== undefined) {
    return resolved;
  }
  if (options?.required === true) {
    throwProfileNotFound(input);
  }
  return undefined;
}
