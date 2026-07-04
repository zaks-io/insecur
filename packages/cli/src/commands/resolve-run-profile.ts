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

function resolvesAsCliProfile(
  userConfig: ResolvedCliContext["userConfig"],
  selector: string,
): boolean {
  return resolveProfile(userConfig, { selector }, { required: false }) !== undefined;
}

function isExplicitProfileIdSelector(selector: string): boolean {
  return selector.startsWith("prof_");
}

function resolvePositionalProfileSelector(input: {
  readonly context: ResolvedCliContext;
  readonly profileSelector: string;
}): ResolveProfileInput | undefined {
  if (isExplicitProfileIdSelector(input.profileSelector)) {
    return { selector: input.profileSelector };
  }
  if (resolvesAsCliProfile(input.context.userConfig, input.profileSelector)) {
    return { selector: input.profileSelector };
  }
  return undefined;
}

function resolveAmbientProfileLookup(context: ResolvedCliContext): ResolveProfileInput {
  const scopeBoundProfileId = resolveScopeBoundProfileId(context);
  if (scopeBoundProfileId !== undefined) {
    return { profileId: scopeBoundProfileId };
  }
  if (isNonEmptyProfileSelector(context.scope.profileSlug)) {
    return { selector: context.scope.profileSlug };
  }
  return {};
}

export function resolveProfileRunLookup(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): ResolveProfileInput {
  if (input.flags.profileId !== undefined) {
    return { profileId: input.flags.profileId };
  }
  if (isNonEmptyProfileSelector(input.flags.profile)) {
    return { selector: input.flags.profile };
  }
  if (isNonEmptyProfileSelector(input.profileSelector)) {
    const positional = resolvePositionalProfileSelector({
      context: input.context,
      profileSelector: input.profileSelector,
    });
    if (positional !== undefined) {
      return positional;
    }
  }
  const ambient = resolveAmbientProfileLookup(input.context);
  if (ambient.profileId !== undefined || ambient.selector !== undefined) {
    return ambient;
  }
  if (isNonEmptyProfileSelector(input.profileSelector)) {
    return { selector: input.profileSelector };
  }
  return {};
}

function hasResolvableExplicitProfileRunSelection(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly profileSelector?: string;
}): boolean {
  if (input.flags.profileId !== undefined) {
    return true;
  }
  if (isNonEmptyProfileSelector(input.flags.profile)) {
    return true;
  }
  if (!isNonEmptyProfileSelector(input.profileSelector)) {
    return false;
  }
  return (
    isExplicitProfileIdSelector(input.profileSelector) ||
    resolvesAsCliProfile(input.context.userConfig, input.profileSelector)
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
  if (hasResolvableExplicitProfileRunSelection(input)) {
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
