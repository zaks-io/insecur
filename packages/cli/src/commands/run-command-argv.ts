import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { resolveProfile } from "../config/profiles/resolve-profile.js";
import { resolveScopeBoundProfileId } from "./resolve-run-profile.js";

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

function hasAmbientProfileRunSelection(context: ResolvedCliContext): boolean {
  return (
    resolveScopeBoundProfileId(context) !== undefined ||
    (context.scope.profileSlug !== undefined && context.scope.profileSlug !== "")
  );
}

/** When Commander binds the child executable as `[profile]`, fall back to project scope profileId. */
export function reconcileProfileRunCommand(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
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

  if (!hasAmbientProfileRunSelection(input.context)) {
    return parsed;
  }

  return {
    command: [parsed.profileSelector, ...parsed.command],
  };
}
