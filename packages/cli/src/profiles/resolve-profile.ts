import type { CliProfileId } from "@insecur/domain";
import type { CliUserConfig, CliUserProfile } from "../config/user-config.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_NOT_FOUND } from "../output/exit-codes.js";

export function resolveProfileSelector(
  selector: string,
  userConfig: CliUserConfig,
): { profileId: CliProfileId; profile: CliUserProfile } {
  if (selector.startsWith("prof_")) {
    const profile = userConfig.profiles[selector as CliProfileId];
    if (profile === undefined) {
      throw new CliError(
        {
          code: "cli.profile_not_found",
          message: `CLI profile not found: ${selector}`,
          retryable: false,
        },
        EXIT_NOT_FOUND,
      );
    }
    return { profileId: selector as CliProfileId, profile };
  }
  const match = Object.entries(userConfig.profiles).find(
    ([, profile]) => profile.slug === selector,
  );
  if (match === undefined) {
    throw new CliError(
      {
        code: "cli.profile_not_found",
        message: `CLI profile not found for slug: ${selector}`,
        retryable: false,
      },
      EXIT_NOT_FOUND,
    );
  }
  return { profileId: match[0] as CliProfileId, profile: match[1] };
}
