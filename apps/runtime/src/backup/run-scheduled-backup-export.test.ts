import { beforeEach, describe, expect, it, vi } from "vitest";

const { runBackupExportMock, runWithRuntimeConnectionMock } = vi.hoisted(() => ({
  runBackupExportMock: vi.fn(),
  runWithRuntimeConnectionMock: vi.fn(
    async (_connectionString: string | undefined, run: () => Promise<unknown>) => ({
      result: await run(),
      closing: Promise.resolve(),
    }),
  ),
}));

const BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY = "backup/export-success.json";

vi.mock("@insecur/backup-restore", () => ({
  runBackupExport: runBackupExportMock,
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
}));

vi.mock("@insecur/tenant-store", () => ({
  runWithRuntimeConnection: runWithRuntimeConnectionMock,
}));

vi.mock("@insecur/crypto", () => ({
  SecretsStoreRootKeyProvider: class {
    async getRootKeyBytes(): Promise<Uint8Array> {
      return new Uint8Array(32);
    }
  },
}));

vi.mock("@sentry/cloudflare", () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/cloudflare";

import type { RuntimeEnv } from "../env.js";
import { runScheduledBackupExport } from "./run-scheduled-backup-export.js";

describe("runScheduledBackupExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runBackupExportMock.mockResolvedValue({ created: true, operation: { operationId: "op_test" } });
  });

  it("runs the export inside a runtime DB connection with the scheduled timestamp", async () => {
    const env = {
      BACKUPS: {
        put: vi.fn().mockResolvedValue(undefined),
      },
      DB: { connectionString: "postgres://runtime@example/db" },
      INSTANCE_ID: "inst_test",
      INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
      RUNTIME_TOKEN_SIGNING_SECRET: "secret",
    };

    await runScheduledBackupExport(
      env as unknown as RuntimeEnv,
      Date.parse("2026-07-08T03:00:00.000Z"),
    );

    expect(runWithRuntimeConnectionMock).toHaveBeenCalledWith(
      "postgres://runtime@example/db",
      expect.any(Function),
      { instrumentSql: expect.any(Function) },
    );
    expect(runBackupExportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt: new Date("2026-07-08T03:00:00.000Z"),
        instanceId: "inst_test",
      }),
    );
  });

  it("pages through the allowlisted telemetry sink when export failure alert fires", async () => {
    runBackupExportMock.mockImplementation(async (input: { onExportFailureAlert?: () => void }) => {
      input.onExportFailureAlert?.();
      return { created: true, operation: { operationId: "op_test" } };
    });

    const env = {
      BACKUPS: { put: vi.fn().mockResolvedValue(undefined) },
      INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
      RUNTIME_TOKEN_SIGNING_SECRET: "secret",
    };

    await runScheduledBackupExport(env as unknown as RuntimeEnv, Date.now());
    expect(Sentry.captureMessage).toHaveBeenCalledWith("backup.export_failed", { level: "error" });
  });
});

interface CapturedBackupExportStorage {
  putLatestEvidence(
    body: string,
    expected: { body: string; version: string } | null,
  ): Promise<boolean>;
  getLatestEvidence(): Promise<{ body: string; version: string } | null>;
}

/**
 * `createR2BackupExportStorage` is not exported: it's only reachable as the `storage` field of
 * the input `runBackupExport` receives. Capture it there so the R2-specific compare-and-swap
 * wiring (onlyIf preconditions, etag plumbing) can be exercised directly against a fake bucket.
 */
async function captureBackupExportStorage(bucketOverrides: {
  put?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
}): Promise<CapturedBackupExportStorage> {
  let captured: CapturedBackupExportStorage | undefined;
  runBackupExportMock.mockImplementation(
    async (input: { storage: CapturedBackupExportStorage }) => {
      captured = input.storage;
      return { created: true, operation: { operationId: "op_test" } };
    },
  );

  const env = {
    BACKUPS: {
      put: bucketOverrides.put ?? vi.fn().mockResolvedValue({ etag: "etag-default" }),
      get: bucketOverrides.get ?? vi.fn().mockResolvedValue(null),
    },
    INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
    RUNTIME_TOKEN_SIGNING_SECRET: "secret",
  };

  await runScheduledBackupExport(env as unknown as RuntimeEnv, Date.now());
  if (captured === undefined) {
    throw new Error("runBackupExport was not called with a storage adapter");
  }
  return captured;
}

describe("createR2BackupExportStorage (the storage adapter passed into runBackupExport)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guards the first latest-evidence publish with an etagDoesNotMatch precondition", async () => {
    const put = vi.fn().mockResolvedValue({ etag: "etag-1" });
    const storage = await captureBackupExportStorage({ put });

    const written = await storage.putLatestEvidence("evidence-body", null);

    expect(written).toBe(true);
    expect(put).toHaveBeenCalledWith(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, "evidence-body", {
      onlyIf: { etagDoesNotMatch: "*" },
    });
  });

  it("guards a pointer advance with an etagMatches precondition keyed to the prior version", async () => {
    const put = vi.fn().mockResolvedValue({ etag: "etag-2" });
    const storage = await captureBackupExportStorage({ put });

    const written = await storage.putLatestEvidence("new-body", {
      body: "old-body",
      version: "etag-old",
    });

    expect(written).toBe(true);
    expect(put).toHaveBeenCalledWith(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, "new-body", {
      onlyIf: { etagMatches: "etag-old" },
    });
  });

  it("reports a lost compare-and-swap as false instead of throwing when R2 rejects the precondition", async () => {
    // R2 `put` resolves to null when its `onlyIf` precondition fails to match.
    const put = vi.fn().mockResolvedValue(null);
    const storage = await captureBackupExportStorage({ put });

    await expect(storage.putLatestEvidence("body", null)).resolves.toBe(false);
  });

  it("returns the stored body and its R2 etag as the latest-evidence snapshot", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ text: () => Promise.resolve("stored-body"), etag: "etag-3" });
    const storage = await captureBackupExportStorage({ get });

    await expect(storage.getLatestEvidence()).resolves.toEqual({
      body: "stored-body",
      version: "etag-3",
    });
  });

  it("returns null from getLatestEvidence when no pointer object exists yet", async () => {
    const get = vi.fn().mockResolvedValue(null);
    const storage = await captureBackupExportStorage({ get });

    await expect(storage.getLatestEvidence()).resolves.toBeNull();
  });
});
