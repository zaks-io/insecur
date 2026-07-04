import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";

export function assertCloudflareScopedTokenConnection(
  connection: AppConnectionRow,
): asserts connection is AppConnectionRow & {
  provider: "cloudflare";
  connectionMethod: "scoped-api-token";
} {
  if (connection.provider !== "cloudflare") {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.invalidConnectionMethod,
      "expected cloudflare provider",
    );
  }
  if (connection.connectionMethod !== "scoped-api-token") {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.invalidConnectionMethod,
      "expected scoped-api-token connection method",
    );
  }
}
