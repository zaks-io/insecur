import {
  appConnectionId,
  organizationId,
  parseDisplayName,
  providerCredentialId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";

import {
  assertAppConnectionSyncEligible,
  isAppConnectionSyncEligible,
} from "../src/assert-app-connection-sync-eligible.js";
import { APP_CONNECTION_ERROR_CODES, AppConnectionError } from "../src/app-connection-error.js";
import {
  connectionMethodRequiresStoredCredential,
  connectionMethodUsesProviderAppRegistration,
} from "../src/connection-method-capabilities.js";
import { toMetadataSafeAppConnectionStatus } from "../src/metadata-safe-connection-status.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

function createConnection(overrides: Partial<AppConnectionRow> = {}): AppConnectionRow {
  return {
    id: CONN,
    organizationId: ORG,
    provider: "cloudflare",
    connectionMethod: "scoped-api-token",
    displayName: testDisplayName("Cloudflare production workers"),
    status: "active",
    setupUserId: SETUP_USER,
    activeCredentialId: CRED,
    statusReasonCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("connection method capabilities", () => {
  it("requires stored credentials for scoped-token and oauth methods", () => {
    expect(connectionMethodRequiresStoredCredential("scoped-api-token")).toBe(true);
    expect(connectionMethodRequiresStoredCredential("vercel-integration-oauth")).toBe(true);
    expect(connectionMethodRequiresStoredCredential("github-app")).toBe(false);
  });

  it("identifies provider app registration methods", () => {
    expect(connectionMethodUsesProviderAppRegistration("github-app")).toBe(true);
    expect(connectionMethodUsesProviderAppRegistration("vercel-integration-oauth")).toBe(true);
    expect(connectionMethodUsesProviderAppRegistration("scoped-api-token")).toBe(false);
  });
});

describe("assertAppConnectionSyncEligible", () => {
  it("allows active credential-backed connections with an active credential", () => {
    expect(() => assertAppConnectionSyncEligible({ connection: createConnection() })).not.toThrow();
    expect(isAppConnectionSyncEligible(createConnection())).toBe(true);
  });

  it("allows active github-app connections without a stored credential", () => {
    const connection = createConnection({
      provider: "github",
      connectionMethod: "github-app",
      activeCredentialId: null,
    });
    expect(() => assertAppConnectionSyncEligible({ connection })).not.toThrow();
  });

  it("fails closed for disconnected connections", () => {
    const connection = createConnection({ status: "disconnected" });
    expect(() => assertAppConnectionSyncEligible({ connection })).toThrow(AppConnectionError);
    try {
      assertAppConnectionSyncEligible({ connection });
    } catch (error) {
      expect(error).toMatchObject({ code: APP_CONNECTION_ERROR_CODES.disconnected });
    }
  });

  it("fails closed for reauthorization-required connections", () => {
    const connection = createConnection({
      status: "reauthorization_required",
      statusReasonCode: "provider.reauth",
    });
    expect(() => assertAppConnectionSyncEligible({ connection })).toThrow(AppConnectionError);
    try {
      assertAppConnectionSyncEligible({ connection });
    } catch (error) {
      expect(error).toMatchObject({
        code: APP_CONNECTION_ERROR_CODES.reauthorizationRequired,
      });
    }
  });

  it("fails closed for pending setup connections", () => {
    const connection = createConnection({
      status: "pending_setup",
      activeCredentialId: null,
    });
    expect(() => assertAppConnectionSyncEligible({ connection })).toThrow(AppConnectionError);
    try {
      assertAppConnectionSyncEligible({ connection });
    } catch (error) {
      expect(error).toMatchObject({ code: APP_CONNECTION_ERROR_CODES.pendingSetup });
    }
  });

  it("fails closed when credential-backed methods lack an active credential", () => {
    const connection = createConnection({ activeCredentialId: null });
    expect(() => assertAppConnectionSyncEligible({ connection })).toThrow(AppConnectionError);
    try {
      assertAppConnectionSyncEligible({ connection });
    } catch (error) {
      expect(error).toMatchObject({ code: APP_CONNECTION_ERROR_CODES.credentialMissing });
    }
  });
});

describe("toMetadataSafeAppConnectionStatus", () => {
  it("returns metadata-only status without credential identifiers", () => {
    const status = toMetadataSafeAppConnectionStatus(createConnection());
    expect(status).toEqual({
      id: CONN,
      organizationId: ORG,
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      displayName: "Cloudflare production workers",
      status: "active",
      statusReasonCode: null,
      hasActiveCredential: true,
      setupUserId: SETUP_USER,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(status)).not.toContain(CRED);
  });
});
