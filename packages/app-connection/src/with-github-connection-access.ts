import type { AppConnectionRow } from "@insecur/tenant-store";

import { assertGitHubAppConnection } from "./assert-github-app-connection.js";
import {
  loadGitHubConnectionBoundary,
  type LoadedGitHubConnectionMetadata,
} from "./load-github-connection-boundary.js";
import {
  withConnectionManageAccess,
  withConnectionReadAccess,
  type ConnectionOperationScope,
} from "./with-connection-access.js";

const githubConnectionAccessDeps = {
  assertConnection: assertGitHubAppConnection,
  loadMetadata: async (input: ConnectionOperationScope) => loadGitHubConnectionBoundary(input),
};

export async function withGitHubConnectionManageAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      metadata: LoadedGitHubConnectionMetadata,
    ) => Promise<T>;
  },
): Promise<T> {
  return withConnectionManageAccess(input, githubConnectionAccessDeps);
}

export async function withGitHubConnectionReadAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      metadata: LoadedGitHubConnectionMetadata,
    ) => Promise<T>;
  },
): Promise<T> {
  return withConnectionReadAccess(input, githubConnectionAccessDeps);
}
