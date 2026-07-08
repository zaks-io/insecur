/** V1 Secret Sync target kinds. `vercel-env` is deferred past V1. */
export const SECRET_SYNC_KINDS = {
  githubActions: "github-actions",
  cloudflareWorkerSecret: "cloudflare-worker-secret",
} as const;

export type SecretSyncKind = (typeof SECRET_SYNC_KINDS)[keyof typeof SECRET_SYNC_KINDS];

const SECRET_SYNC_KIND_SET = new Set<string>(Object.values(SECRET_SYNC_KINDS));

export function isSecretSyncKind(value: string): value is SecretSyncKind {
  return SECRET_SYNC_KIND_SET.has(value);
}

export const SECRET_SYNC_MAPPING_BEHAVIORS = {
  managed: "managed",
  merge: "merge",
} as const;

export type SecretSyncMappingBehavior =
  (typeof SECRET_SYNC_MAPPING_BEHAVIORS)[keyof typeof SECRET_SYNC_MAPPING_BEHAVIORS];

export const GITHUB_ACTIONS_PROVIDER_SCOPES = {
  environment: "environment",
  repository: "repository",
} as const;

export type GitHubActionsProviderScope =
  (typeof GITHUB_ACTIONS_PROVIDER_SCOPES)[keyof typeof GITHUB_ACTIONS_PROVIDER_SCOPES];
