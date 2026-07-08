import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";

export function assertGitHubAppConnection(
  connection: AppConnectionRow,
): asserts connection is AppConnectionRow & {
  provider: "github";
  connectionMethod: "github-app";
} {
  if (connection.provider !== "github") {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.invalidConnectionMethod,
      "expected github provider",
    );
  }
  if (connection.connectionMethod !== "github-app") {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.invalidConnectionMethod,
      "expected github-app connection method",
    );
  }
}
