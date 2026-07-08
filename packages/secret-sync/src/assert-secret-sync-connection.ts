import { assertAppConnectionSyncEligible } from "@insecur/app-connection";
import { SECRET_SYNC_ERROR_CODES, SECRET_SYNC_KINDS, type SecretSyncKind } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";

import { SecretSyncError } from "./secret-sync-error.js";

export interface AssertSecretSyncConnectionInput {
  readonly kind: SecretSyncKind;
  readonly connection: AppConnectionRow;
}

function assertProviderMatchesKind(kind: SecretSyncKind, connection: AppConnectionRow): void {
  if (kind === SECRET_SYNC_KINDS.githubActions && connection.provider !== "github") {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "github-actions secret sync requires a github app connection",
    );
  }
  if (kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret && connection.provider !== "cloudflare") {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "cloudflare worker secret sync requires a cloudflare app connection",
    );
  }
}

export function assertSecretSyncConnection(input: AssertSecretSyncConnectionInput): void {
  if (input.connection.status === "disconnected") {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection is disconnected",
    );
  }

  assertProviderMatchesKind(input.kind, input.connection);

  try {
    assertAppConnectionSyncEligible({ connection: input.connection });
  } catch {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection is not eligible",
    );
  }
}
