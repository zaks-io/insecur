import type { CliProfileId, ResolvedTargetEcho } from "@insecur/domain";
import type { CliUserProfile } from "../config/user-config.js";
import { asEchoId } from "../output/target-echo.js";

export function buildCliProfileResolvedTarget(
  profileId: CliProfileId,
  profile: CliUserProfile,
): ResolvedTargetEcho {
  return {
    type: "cli_profile",
    id: asEchoId(profileId),
    slug: profile.slug,
    displayName: profile.displayName,
  };
}
