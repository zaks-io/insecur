import {
  PROVIDER_ERROR_CODES,
  appConnectionId,
  isStableDottedCode,
  organizationId,
  secretSyncBindingId,
  secretSyncId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  PROVIDER_LOOKUP_STATUSES,
  PROVIDER_PERMISSION_STATUSES,
  PROVIDER_TARGET_EXISTENCE,
  hasProviderOverwriteWarning,
  isProviderLookupStatus,
  lookupExactDestinationSafely,
  resolveProviderLookupPort,
  toProviderPermissionStatus,
  toProviderTargetExistence,
  type ProviderDestinationLookupRequest,
} from "../src/provider-lookup-port.js";

const REQUEST: ProviderDestinationLookupRequest = {
  providerKind: "github-actions",
  organizationId: organizationId.brand("org_00000000000000000000000001"),
  appConnectionId: appConnectionId.brand("conn_00000000000000000000000001"),
  secretSyncId: secretSyncId.brand("sync_00000000000000000000000001"),
  bindingId: secretSyncBindingId.brand("sbind_00000000000000000000000001"),
  githubProviderScope: "repository",
  targetRepoId: "repo_00000000000000000000000001",
  targetGithubEnvironmentId: null,
  hasWorkerScriptTarget: false,
};

describe("provider lookup statuses", () => {
  it("uses stable dotted codes for every normalized status", () => {
    for (const status of [
      ...Object.values(PROVIDER_LOOKUP_STATUSES),
      ...Object.values(PROVIDER_TARGET_EXISTENCE),
      ...Object.values(PROVIDER_PERMISSION_STATUSES),
    ]) {
      expect(isStableDottedCode(status)).toBe(true);
    }
  });

  it("derives target existence, permission status, and overwrite warning from lookup status", () => {
    expect(toProviderTargetExistence(PROVIDER_LOOKUP_STATUSES.found)).toBe(
      PROVIDER_TARGET_EXISTENCE.exists,
    );
    expect(toProviderTargetExistence(PROVIDER_LOOKUP_STATUSES.notFound)).toBe(
      PROVIDER_TARGET_EXISTENCE.missing,
    );
    expect(toProviderTargetExistence(PROVIDER_LOOKUP_STATUSES.unavailable)).toBe(
      PROVIDER_TARGET_EXISTENCE.unknown,
    );
    expect(toProviderTargetExistence(PROVIDER_LOOKUP_STATUSES.targetMissing)).toBe(
      PROVIDER_TARGET_EXISTENCE.unknown,
    );

    expect(toProviderPermissionStatus(PROVIDER_LOOKUP_STATUSES.found)).toBe(
      PROVIDER_PERMISSION_STATUSES.granted,
    );
    expect(toProviderPermissionStatus(PROVIDER_LOOKUP_STATUSES.targetMissing)).toBe(
      PROVIDER_PERMISSION_STATUSES.granted,
    );
    expect(toProviderPermissionStatus(PROVIDER_LOOKUP_STATUSES.permissionDenied)).toBe(
      PROVIDER_PERMISSION_STATUSES.denied,
    );
    expect(toProviderPermissionStatus(PROVIDER_LOOKUP_STATUSES.boundaryMismatch)).toBe(
      PROVIDER_PERMISSION_STATUSES.unknown,
    );

    expect(hasProviderOverwriteWarning(PROVIDER_LOOKUP_STATUSES.found)).toBe(true);
    expect(hasProviderOverwriteWarning(PROVIDER_LOOKUP_STATUSES.notFound)).toBe(false);
  });
});

describe("resolveProviderLookupPort", () => {
  it("fails closed with provider.unavailable when no adapter is configured for the kind", () => {
    expect(() => resolveProviderLookupPort({}, "github-actions")).toThrowError(
      expect.objectContaining({ code: PROVIDER_ERROR_CODES.unavailable }),
    );
  });

  it("returns the adapter registered for the sync kind", () => {
    const port = {
      lookupExactDestination: async () => ({ status: PROVIDER_LOOKUP_STATUSES.found }),
    };
    expect(resolveProviderLookupPort({ "github-actions": port }, "github-actions")).toBe(port);
  });
});

describe("lookupExactDestinationSafely", () => {
  it("passes through normalized adapter statuses", async () => {
    const result = await lookupExactDestinationSafely(
      { lookupExactDestination: async () => ({ status: PROVIDER_LOOKUP_STATUSES.notFound }) },
      REQUEST,
    );
    expect(result.status).toBe(PROVIDER_LOOKUP_STATUSES.notFound);
  });

  it("normalizes adapter failures to unavailable without leaking provider error detail", async () => {
    const result = await lookupExactDestinationSafely(
      {
        lookupExactDestination: async () => {
          throw new Error("raw provider body: secret=hunter2 x-request-id=abc");
        },
      },
      REQUEST,
    );
    expect(result).toEqual({ status: PROVIDER_LOOKUP_STATUSES.unavailable });
  });

  it("fails closed to unavailable on out-of-vocabulary adapter statuses", async () => {
    const result = await lookupExactDestinationSafely(
      {
        lookupExactDestination: async () => ({
          status: "provider says: 403 Forbidden" as never,
        }),
      },
      REQUEST,
    );
    expect(result.status).toBe(PROVIDER_LOOKUP_STATUSES.unavailable);
    expect(isProviderLookupStatus(result.status)).toBe(true);
  });
});
