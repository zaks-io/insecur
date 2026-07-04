import type { CliProfileId, RuntimePolicyId } from "@insecur/domain";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseOptionalRuntimePolicyId } from "../config/parse-resource-id.js";
import { resolveProfile, type ResolvedProfile } from "../config/profiles/resolve-profile.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { CliUserConfig, CliUserProfile } from "../config/user-config.js";
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

function resolveProfileRunSelector(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): string | undefined {
  const selector = input.profileSelector ?? input.flags.profile ?? input.context.scope.profileSlug;
  return selector === "" ? undefined : selector;
}

function hasExplicitProfileRunSelection(input: {
  readonly flags: GlobalCliFlags;
  readonly profileSelector?: string;
}): boolean {
  const selector = input.profileSelector ?? input.flags.profile;
  if (selector !== undefined && selector !== "") {
    return true;
  }
  return input.flags.profileId !== undefined;
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
    // Ambient scope profile supplies org/project/env defaults only.
    return false;
  }

  const scopeProfileSlug = input.context.scope.profileSlug;
  return scopeProfileSlug !== undefined && scopeProfileSlug !== "";
}

export function resolveProfileRunInput(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
  readonly policyIdOverride?: string;
}): ResolvedProfileRunInput {
  const userConfig: CliUserConfig = input.context.userConfig;
  const profileSelector = resolveProfileRunSelector(input);
  const resolvedProfile = resolveProfile(
    userConfig,
    {
      ...(input.flags.profileId === undefined ? {} : { profileId: input.flags.profileId }),
      ...(profileSelector === undefined ? {} : { selector: profileSelector }),
    },
    { required: true },
  );
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
        : "Pass --variable-key or select a CLI profile via argument, --profile, --profile-id, or INSECUR_PROFILE.",
      retryable: false,
    });
  }
}
