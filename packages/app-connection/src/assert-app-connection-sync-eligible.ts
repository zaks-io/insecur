import type { AppConnectionRow } from "@insecur/tenant-store";

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "./app-connection-error.js";
import { connectionMethodRequiresStoredCredential } from "./connection-method-capabilities.js";

export interface AssertAppConnectionSyncEligibleInput {
  readonly connection: AppConnectionRow;
}

export function assertAppConnectionSyncEligible(input: AssertAppConnectionSyncEligibleInput): void {
  const { connection } = input;

  if (connection.status === "disconnected") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.disconnected);
  }

  if (connection.status === "reauthorization_required") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.reauthorizationRequired);
  }

  if (connection.status === "pending_setup") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.pendingSetup);
  }

  if (
    connectionMethodRequiresStoredCredential(connection.connectionMethod) &&
    connection.activeCredentialId === null
  ) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.credentialMissing);
  }
}

export function isAppConnectionSyncEligible(connection: AppConnectionRow): boolean {
  try {
    assertAppConnectionSyncEligible({ connection });
    return true;
  } catch {
    return false;
  }
}
