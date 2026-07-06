import type { CliProfileId, RuntimePolicyId } from "@insecur/domain";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseOptionalRuntimePolicyId } from "../config/parse-resource-id.js";
import {
  resolveProfile,
  type ResolvedProfile,
  type ResolveProfileInput,
} from "../config/profiles/resolve-profile.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { CliUserProfile } from "../config/user-config.js";
import { CliError } from "../output/cli-error.js";
import { requireSecretWriteScope, type ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export interface ResolvedProfileRunInput {
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly policyId: RuntimePolicyId;
  readonly profileId: CliProfileId;
  readonly profileSlug: string;
  readonly profile: CliUserProfile;
}

function requirePolicyId(
  policyId: RuntimePolicyId | undefined,
  profile: ResolvedProfile,
): RuntimePolicyId {
  if (policyId !== undefined) {
    return policyId;
  }
  if (profile.profile.defaultRunPolicyId !== undefined) {
    return profile.profile.defaultRunPolicyId;
  }
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    message:
      "Runtime injection policy is required. Pass --policy-id or set defaultRunPolicyId on the CLI profile.",
    retryable: false,
  });
}

function isNonEmptyProfileSelector(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** Profile id bound from project `.insecur.json` into resolved CLI scope. */
export function resolveScopeBoundProfileId(context: ResolvedCliContext): CliProfileId | undefined {
  return context.scope.profileId ?? context.projectConfig?.profileId;
}

export function resolveProfileRunLookup(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): ResolveProfileInput {
  if (input.flags.profileId !== undefined) {
    return { profileId: input.flags.profileId };
  }

  const explicitSelector = input.profileSelector ?? input.flags.profile;
  if (isNonEmptyProfileSelector(explicitSelector)) {
    return { selector: explicitSelector };
  }

  const scopeBoundProfileId = resolveScopeBoundProfileId(input.context);
  if (scopeBoundProfileId !== undefined) {
    return { profileId: scopeBoundProfileId };
  }

  if (isNonEmptyProfileSelector(input.context.scope.profileSlug)) {
    return { selector: input.context.scope.profileSlug };
  }

  return {};
}

function hasExplicitProfileRunSelection(input: {
  readonly flags: GlobalCliFlags;
  readonly profileSelector?: string;
}): boolean {
  return (
    isNonEmptyProfileSelector(input.profileSelector ?? input.flags.profile) ||
    input.flags.profileId !== undefined
  );
}

function hasAmbientProfileRunSelection(context: ResolvedCliContext): boolean {
  return (
    resolveScopeBoundProfileId(context) !== undefined ||
    isNonEmptyProfileSelector(context.scope.profileSlug)
  );
}

function hasProfileBackedRunMode(input: {
  readonly variableKey?: string;
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): boolean {
  if (hasExplicitProfileRunSelection(input)) {
    return true;
  }

  const hasVariableKey = input.variableKey !== undefined && input.variableKey !== "";
  if (hasVariableKey) {
    // Ambient project/scope profile supplies org/project/env defaults only.
    return false;
  }

  return hasAmbientProfileRunSelection(input.context);
}

export function resolveProfileRunInput(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
  readonly policyIdOverride?: string;
}): ResolvedProfileRunInput {
  const resolvedProfile = resolveProfile(input.context.userConfig, resolveProfileRunLookup(input), {
    required: true,
  });
  const scope = {
    host: resolvedProfile.profile.host,
    orgId: resolvedProfile.profile.orgId,
    projectId: resolvedProfile.profile.projectId,
    envId: resolvedProfile.profile.envId,
    profileId: resolvedProfile.profileId,
    profileSlug: resolvedProfile.profile.slug,
    profile: resolvedProfile.profile,
  };
  const policyId = requirePolicyId(
    parseOptionalRuntimePolicyId(input.policyIdOverride, "--policy-id"),
    resolvedProfile,
  );
  return {
    host: scope.host,
    runScope: requireSecretWriteScope(scope),
    policyId,
    profileId: resolvedProfile.profileId,
    profileSlug: resolvedProfile.profile.slug,
    profile: resolvedProfile.profile,
  };
}

export function splitRunCommandArgs(args: readonly string[]): {
  readonly profileSelector?: string;
  readonly command: readonly string[];
} {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex >= 0) {
    const head = args.slice(0, separatorIndex);
    const command = args.slice(separatorIndex + 1);
    const profileSelector = head[0];
    return {
      ...(profileSelector === undefined || profileSelector === "" ? {} : { profileSelector }),
      command,
    };
  }
  return { command: args };
}

export function parseRunCommandArgv(input: {
  readonly positionalProfile?: string;
  readonly args: readonly string[];
}): {
  readonly profileSelector?: string;
  readonly command: readonly string[];
} {
  const split = splitRunCommandArgs(input.args);
  const positionalProfile =
    input.positionalProfile === undefined || input.positionalProfile === ""
      ? undefined
      : input.positionalProfile;
  const profileSelector = positionalProfile ?? split.profileSelector;
  const command =
    positionalProfile !== undefined &&
    split.profileSelector === undefined &&
    split.command[0] === positionalProfile
      ? split.command.slice(1)
      : split.command;
  return {
    ...(profileSelector === undefined ? {} : { profileSelector }),
    command,
  };
}

/** The `--variable-key` fold applies only when the positional was not an explicitly typed profile. */
function hasVariableKeyFold(input: {
  readonly variableKey?: string;
  readonly explicitProfilePositional?: boolean;
}): boolean {
  return (
    input.variableKey !== undefined &&
    input.variableKey !== "" &&
    input.explicitProfilePositional !== true
  );
}

/**
 * When Commander binds the child executable as `[profile]`, fold it back into the command: a
 * selector that resolves to no real profile is the command head whenever another run mode is
 * already selected, by `--variable-key` (the wizard's CLI handoff runs profile-less) or by an
 * ambient project/scope profile. The `--variable-key` fold is deliberately narrow: it never
 * applies when the user explicitly typed a profile before the `--` separator
 * (`explicitProfilePositional`), so a typo'd profile stays a loud mode-exclusivity error instead
 * of silently becoming the child executable.
 */
export function reconcileProfileRunCommand(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly variableKey?: string;
  /** True when the `[profile]` positional appeared before the `--` separator in raw argv. */
  readonly explicitProfilePositional?: boolean;
  readonly positionalProfile?: string;
  readonly args: readonly string[];
}): {
  readonly profileSelector?: string;
  readonly command: readonly string[];
} {
  const parsed = parseRunCommandArgv({
    ...(input.positionalProfile === undefined
      ? {}
      : { positionalProfile: input.positionalProfile }),
    args: input.args,
  });

  if (parsed.profileSelector === undefined || input.flags.profileId !== undefined) {
    return parsed;
  }

  const resolved = resolveProfile(
    input.context.userConfig,
    { selector: parsed.profileSelector },
    { required: false },
  );
  if (resolved !== undefined) {
    return parsed;
  }

  if (!hasVariableKeyFold(input) && !hasAmbientProfileRunSelection(input.context)) {
    return parsed;
  }

  return {
    command: [parsed.profileSelector, ...parsed.command],
  };
}

/**
 * Did the user explicitly type the `[profile]` positional before `--`? Commander strips the
 * separator from `command.args`, so `run staging -- npm test` and `run --variable-key K -- npm
 * test` bind identical shapes; raw argv is the only place the difference survives.
 */
export function isExplicitProfilePositional(
  rawArgs: readonly string[],
  positionalProfile: string | undefined,
): boolean {
  if (positionalProfile === undefined || positionalProfile === "") {
    return false;
  }
  const separatorIndex = rawArgs.indexOf("--");
  if (separatorIndex === -1) {
    return true;
  }
  return rawArgs.slice(0, separatorIndex).includes(positionalProfile);
}

export function assertRunModeExclusive(input: {
  readonly variableKey?: string;
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): void {
  const hasVariableKey = input.variableKey !== undefined && input.variableKey !== "";
  const hasProfile = hasProfileBackedRunMode(input);
  if (hasVariableKey === hasProfile) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: hasVariableKey
        ? "Pass either --variable-key or a CLI profile, not both."
        : "Pass --variable-key or select a CLI profile via argument, --profile, --profile-id, INSECUR_PROFILE, or the project .insecur.json profileId.",
      retryable: false,
    });
  }
}
