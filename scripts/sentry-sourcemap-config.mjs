const DEFAULT_SENTRY_ORG = "zaksio";
const DEFAULT_SENTRY_PROJECT = "insecur";

export function resolveSentrySourcemapConfig(env = process.env) {
  const authToken = optional(env.SENTRY_AUTH_TOKEN);
  const requireUpload = env.INSECUR_REQUIRE_SENTRY_SOURCEMAPS === "true";
  const release = optional(env.SENTRY_RELEASE) ?? optional(env.INSECUR_DEPLOY_SHA);
  const org = optional(env.SENTRY_ORG) ?? DEFAULT_SENTRY_ORG;
  const project = optional(env.SENTRY_PROJECT) ?? DEFAULT_SENTRY_PROJECT;

  if (!authToken) {
    if (requireUpload) {
      throw new Error(
        "SENTRY_AUTH_TOKEN is required for Sentry source map upload. Store the token as the repository Actions secret SENTRY_AUTH_TOKEN (or an optional Preview/Production environment override).",
      );
    }
    return { action: "skip", reason: "missing_auth_token" };
  }

  if (!release) {
    throw new Error(
      "SENTRY_RELEASE or INSECUR_DEPLOY_SHA is required for Sentry source map upload.",
    );
  }

  return {
    action: "upload",
    authToken,
    org,
    project,
    release,
  };
}

function optional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
