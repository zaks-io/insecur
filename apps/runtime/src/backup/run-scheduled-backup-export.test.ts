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

vi.mock("@insecur/backup-restore", async (importOriginal) => {
  // Keep the real BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY export so the R2 storage adapter under test
  // (createR2BackupExportStorage) reads/writes the same key the assertions below inspect.
  const actual = await importOriginal<typeof import("@insecur/backup-restore")>();
  return {
    ...actual,
    runBackupExport: runBackupExportMock,
  };
});

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
import type { BackupExportStorage } from "@insecur/backup-restore";

import type { RuntimeEnv } from "../env.js";
import { runScheduledBackupExport } from "./run-scheduled-backup-export.js";

/**
 * Minimal R2Bucket fake that implements the etag-based conditional-put semantics
 * (`onlyIf.etagDoesNotMatch`/`onlyIf.etagMatches`) that createR2BackupExportStorage relies on to
 * turn the publisher's read-guard-write into a real compare-and-swap.
 */
function createFakeR2BackupBucket(): {
  readonly bucket: R2Bucket;
} {
  let stored: { readonly body: string; readonly etag: string } | undefined;
  let etagCounter = 0;

  const put = vi.fn(
    async (
      _key: string,
      body: string,
      options?: { onlyIf?: { etagDoesNotMatch?: string; etagMatches?: string } },
    ) => {
      const onlyIf = options?.onlyIf;
      if (onlyIf?.etagDoesNotMatch === "*" && stored !== undefined) {
        return null;
      }
      if (onlyIf?.etagMatches !== undefined && stored?.etag !== onlyIf.etagMatches) {
        return null;
      }
      etagCounter += 1;
      stored = { body, etag: `etag-${etagCounter}` };
      return { etag: stored.etag };
    },
  );

  const get = vi.fn(async () => {
    if (stored === undefined) {
      return null;
    }
    const snapshot = stored;
    return { etag: snapshot.etag, text: async () => snapshot.body };
  });

  return { bucket: { put, get } as unknown as R2Bucket };
}

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

  it("wires the R2 storage adapter's getLatestEvidence to surface the object's etag as the CAS version", async () => {
    const { bucket } = createFakeR2BackupBucket();
    const env = {
      BACKUPS: bucket,
      INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
      RUNTIME_TOKEN_SIGNING_SECRET: "secret",
    };

    await runScheduledBackupExport(env as unknown as RuntimeEnv, Date.now());
    const storage = runBackupExportMock.mock.calls[0]?.[0]?.storage as BackupExportStorage;

    await expect(storage.getLatestEvidence()).resolves.toBeNull();

    const created = await storage.putLatestEvidence("evidence-v1", null);
    expect(created).toBe(true);

    await expect(storage.getLatestEvidence()).resolves.toEqual({
      body: "evidence-v1",
      version: expect.any(String),
    });
  });

  it("refuses to seed the R2 latest-evidence pointer with expected=null once it already exists", async () => {
    const { bucket } = createFakeR2BackupBucket();
    const env = {
      BACKUPS: bucket,
      INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
      RUNTIME_TOKEN_SIGNING_SECRET: "secret",
    };

    await runScheduledBackupExport(env as unknown as RuntimeEnv, Date.now());
    const storage = runBackupExportMock.mock.calls[0]?.[0]?.storage as BackupExportStorage;

    await storage.putLatestEvidence("evidence-v1", null);
    const conflicted = await storage.putLatestEvidence("evidence-v2", null);
    expect(conflicted).toBe(false);
    await expect(storage.getLatestEvidence()).resolves.toEqual({
      body: "evidence-v1",
      version: expect.any(String),
    });
  });

  it("makes the R2 storage adapter's putLatestEvidence a real compare-and-swap on the etag", async () => {
    const { bucket } = createFakeR2BackupBucket();
    const env = {
      BACKUPS: bucket,
      INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
      RUNTIME_TOKEN_SIGNING_SECRET: "secret",
    };

    await runScheduledBackupExport(env as unknown as RuntimeEnv, Date.now());
    const storage = runBackupExportMock.mock.calls[0]?.[0]?.storage as BackupExportStorage;

    await storage.putLatestEvidence("evidence-v1", null);
    const staleSnapshot = await storage.getLatestEvidence();

    // A concurrent publisher advances the pointer using the same (now-stale) snapshot.
    const advanced = await storage.putLatestEvidence("evidence-v2", staleSnapshot);
    expect(advanced).toBe(true);

    // The original writer, still holding the pre-race snapshot, must lose its CAS instead of
    // silently overwriting the newer evidence.
    const staleWrite = await storage.putLatestEvidence("evidence-stale", staleSnapshot);
    expect(staleWrite).toBe(false);

    await expect(storage.getLatestEvidence()).resolves.toEqual({
      body: "evidence-v2",
      version: expect.any(String),
    });
  });
});
