import {
  APP_CONNECTION_ERROR_CODES,
  appConnectionId,
  organizationId,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertCloudflareScopedTokenConnection } from "../src/assert-cloudflare-scoped-token-connection.js";
import type { AppConnectionRow } from "@insecur/tenant-store";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");

const CLOUDFLARE_CONNECTION: AppConnectionRow = {
  id: CONN,
  organizationId: ORG,
  provider: "cloudflare",
  connectionMethod: "scoped-api-token",
  displayName: "Cloudflare workers",
  status: "active",
  setupUserId: SETUP_USER,
  activeCredentialId: null,
  statusReasonCode: null,
  lastValidationCheckedAt: null,
  lastValidationOutcome: null,
  lastValidationReasonCode: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("assertCloudflareScopedTokenConnection", () => {
  it("accepts cloudflare scoped-api-token connections", () => {
    expect(() => assertCloudflareScopedTokenConnection(CLOUDFLARE_CONNECTION)).not.toThrow();
  });

  it("rejects non-cloudflare providers", () => {
    expect(() =>
      assertCloudflareScopedTokenConnection({
        ...CLOUDFLARE_CONNECTION,
        provider: "github",
      }),
    ).toThrow(
      expect.objectContaining({ code: APP_CONNECTION_ERROR_CODES.invalidConnectionMethod }),
    );
  });

  it("rejects non scoped-api-token connection methods", () => {
    expect(() =>
      assertCloudflareScopedTokenConnection({
        ...CLOUDFLARE_CONNECTION,
        connectionMethod: "github-app",
      }),
    ).toThrow(
      expect.objectContaining({ code: APP_CONNECTION_ERROR_CODES.invalidConnectionMethod }),
    );
  });
});
