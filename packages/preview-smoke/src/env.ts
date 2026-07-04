export interface PreviewConfig {
  apiBaseUrl: string;
  databaseUrl: string;
  expectedSha: string;
  inviteeUserId: string;
  inviteeWorkosUserId: string;
  ownerUserId: string;
  ownerWorkosUserId: string;
  signingSecret: string;
  siteBaseUrl: string;
  webBaseUrl: string;
}

export function loadPreviewConfig(): PreviewConfig {
  const signingSecret = requireEnv("SMOKE_SESSION_SIGNING_SECRET");
  return {
    apiBaseUrl: requireEnv("SMOKE_API_BASE_URL", "SMOKE_BASE_URL").replace(/\/$/u, ""),
    databaseUrl: requireEnv("PREVIEW_DATABASE_URL_MIGRATION", "DATABASE_URL_MIGRATION"),
    expectedSha: requireEnv("SMOKE_EXPECTED_DEPLOY_SHA", "GITHUB_SHA"),
    inviteeUserId: requireEnv("SMOKE_INVITEE_ADMITTED_USER_ID"),
    inviteeWorkosUserId: requireEnv("SMOKE_INVITEE_WORKOS_USER_ID"),
    ownerUserId: requireEnv("SMOKE_ADMITTED_USER_ID"),
    ownerWorkosUserId: requireEnv("SMOKE_WORKOS_USER_ID"),
    signingSecret,
    siteBaseUrl: requireEnv("SMOKE_SITE_BASE_URL").replace(/\/$/u, ""),
    webBaseUrl: requireEnv("SMOKE_WEB_BASE_URL").replace(/\/$/u, ""),
  };
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") {
      return value;
    }
  }
  throw new Error(`${names.join(" or ")} is required`);
}
