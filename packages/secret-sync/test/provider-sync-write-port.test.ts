import { PlaintextHandle } from "@insecur/crypto";
import { PROVIDER_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  PROVIDER_WRITE_STATUSES,
  commitStagedWritesSafely,
  isActionRequiredWriteStatus,
  isProviderWriteStatus,
  resolveProviderWritePort,
  writeExactDestinationSafely,
  type ProviderSecretWriteRequest,
  type ProviderStagedCommitRequest,
  type SecretSyncProviderWritePort,
} from "../src/provider-sync-write-port.js";
import { BINDING, CONN, ORG, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const REQUEST: ProviderSecretWriteRequest = {
  providerKind: "github-actions",
  organizationId: ORG,
  appConnectionId: CONN,
  secretSyncId: SYNC,
  bindingId: BINDING,
  githubProviderScope: "repository",
  targetRepoId: "repo_00000000000000000000000001",
  targetGithubEnvironmentId: null,
  destinationName: "DEPLOY_TOKEN",
  value: new PlaintextHandle(new Uint8Array([1])),
};

const COMMIT_REQUEST: ProviderStagedCommitRequest = {
  providerKind: "cloudflare-worker-secret",
  organizationId: ORG,
  appConnectionId: CONN,
  secretSyncId: SYNC,
};

function portReturning(status: string): SecretSyncProviderWritePort {
  return {
    assertWritableDestination: () => undefined,
    writeExactDestination: async () => ({ status: status as never }),
  };
}

describe("provider sync write port", () => {
  it("fails closed when no adapter is configured for the sync kind", () => {
    expect(() => resolveProviderWritePort({}, "github-actions")).toThrowError(
      expect.objectContaining({ code: PROVIDER_ERROR_CODES.unavailable }) as Error,
    );
  });

  it("normalizes adapter throws to a retryable status without leaking detail", async () => {
    const throwing: SecretSyncProviderWritePort = {
      assertWritableDestination: () => undefined,
      writeExactDestination: async () => {
        throw new Error("raw provider response body must never escape");
      },
    };

    const result = await writeExactDestinationSafely(throwing, REQUEST);

    expect(result).toEqual({ status: PROVIDER_WRITE_STATUSES.retryableUnavailable });
  });

  it("normalizes out-of-vocabulary statuses to retryable", async () => {
    const result = await writeExactDestinationSafely(
      portReturning("github_native_error_text"),
      REQUEST,
    );
    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
  });

  it("treats a per-binding port without a staged-commit seam as already committed", async () => {
    const result = await commitStagedWritesSafely(
      portReturning(PROVIDER_WRITE_STATUSES.written),
      COMMIT_REQUEST,
    );
    expect(result).toEqual({ status: PROVIDER_WRITE_STATUSES.written });
  });

  it("normalizes staged-commit throws and out-of-vocabulary statuses to retryable", async () => {
    const throwing: SecretSyncProviderWritePort = {
      ...portReturning(PROVIDER_WRITE_STATUSES.written),
      commitStagedWrites: async () => {
        throw new Error("raw provider deploy response must never escape");
      },
    };
    const offVocabulary: SecretSyncProviderWritePort = {
      ...portReturning(PROVIDER_WRITE_STATUSES.written),
      commitStagedWrites: async () => ({ status: "cloudflare_native_error_text" as never }),
    };

    expect(await commitStagedWritesSafely(throwing, COMMIT_REQUEST)).toEqual({
      status: PROVIDER_WRITE_STATUSES.retryableUnavailable,
    });
    expect(await commitStagedWritesSafely(offVocabulary, COMMIT_REQUEST)).toEqual({
      status: PROVIDER_WRITE_STATUSES.retryableUnavailable,
    });
  });

  it("passes through a normalized staged-commit status", async () => {
    const denied: SecretSyncProviderWritePort = {
      ...portReturning(PROVIDER_WRITE_STATUSES.written),
      commitStagedWrites: async () => ({ status: PROVIDER_WRITE_STATUSES.permissionDenied }),
    };
    expect(await commitStagedWritesSafely(denied, COMMIT_REQUEST)).toEqual({
      status: PROVIDER_WRITE_STATUSES.permissionDenied,
    });
  });

  it("classifies write statuses for retry semantics", () => {
    expect(isProviderWriteStatus(PROVIDER_WRITE_STATUSES.written)).toBe(true);
    expect(isProviderWriteStatus("provider_write.bogus")).toBe(false);
    expect(isActionRequiredWriteStatus(PROVIDER_WRITE_STATUSES.permissionDenied)).toBe(true);
    expect(isActionRequiredWriteStatus(PROVIDER_WRITE_STATUSES.targetMissing)).toBe(true);
    expect(isActionRequiredWriteStatus(PROVIDER_WRITE_STATUSES.retryableUnavailable)).toBe(false);
    expect(isActionRequiredWriteStatus(PROVIDER_WRITE_STATUSES.written)).toBe(false);
  });
});
