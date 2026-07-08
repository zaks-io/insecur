import type { AppConnectionRow } from "@insecur/tenant-store";

import { assertCloudflareScopedTokenConnection } from "./assert-cloudflare-scoped-token-connection.js";
import { loadCloudflareConnectionBoundary } from "./load-cloudflare-connection-boundary.js";
import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import {
  withConnectionManageAccess,
  withConnectionReadAccess,
  type ConnectionOperationScope,
} from "./with-connection-access.js";

const cloudflareConnectionAccessDeps = {
  assertConnection: assertCloudflareScopedTokenConnection,
  loadMetadata: async (input: ConnectionOperationScope) => loadCloudflareConnectionBoundary(input),
};

export async function withCloudflareConnectionManageAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      boundary: CloudflareConnectionBoundary,
    ) => Promise<T>;
  },
): Promise<T> {
  return withConnectionManageAccess(input, cloudflareConnectionAccessDeps);
}

export async function withCloudflareConnectionReadAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      boundary: CloudflareConnectionBoundary,
    ) => Promise<T>;
  },
): Promise<T> {
  return withConnectionReadAccess(input, cloudflareConnectionAccessDeps);
}
