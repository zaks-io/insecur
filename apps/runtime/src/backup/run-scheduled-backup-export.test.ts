import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runBackupExportMock, runWithRuntimeConnectionMock, rootKeyMock, closingMock } = vi.hoisted(
  () => ({
    runBackupExportMock: vi.fn(),
    rootKeyMock: vi.fn(),
    closingMock: vi.fn(),
    runWithRuntimeConnectionMock: vi.fn(),
  }),
);

vi.mock("@insecur/backup-restore", () => ({ runBackupExport: runBackupExportMock }));
vi.mock("@insecur/tenant-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@insecur/tenant-store")>()),
  runWithRuntimeConnection: runWithRuntimeConnectionMock,
}));
vi.mock("@insecur/crypto", () => ({
  SecretsStoreRootKeyProvider: class {
    getRootKeyBytes = rootKeyMock;
  },
}));
vi.mock("@sentry/cloudflare", () => ({
  captureMessage: vi.fn(),
  instrumentPostgresJsSql: (sql: unknown) => sql,
}));

import * as Sentry from "@sentry/cloudflare";
import { RuntimeConfigMissingError } from "@insecur/tenant-store";
import type { RuntimeEnv } from "../env.js";
import { runScheduledBackupExport } from "./run-scheduled-backup-export.js";

const scheduledTime = Date.parse("2026-07-08T03:00:00.000Z");
const ctx = { waitUntil: vi.fn() };
function runtimeEnv(): RuntimeEnv {
  return {
    BACKUPS: { put: vi.fn().mockResolvedValue(undefined) },
    DB: { connectionString: "postgres://runtime@example/db" },
    INSTANCE_ID: "inst_test",
    INSTANCE_ROOT_KEY_V1: { get: vi.fn() },
  } as unknown as RuntimeEnv;
}

describe("runScheduledBackupExport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rootKeyMock.mockResolvedValue(new Uint8Array(32));
    runBackupExportMock.mockResolvedValue({ created: true, operation: { operationId: "op_test" } });
    closingMock.mockReturnValue(Promise.resolve());
    runWithRuntimeConnectionMock.mockImplementation(
      async (_url: string, run: () => Promise<unknown>) => ({
        result: await run(),
        closing: closingMock(),
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a fresh scoped client on each invocation and preserves the scheduled timestamp", async () => {
    const env = runtimeEnv();
    await runScheduledBackupExport(env, scheduledTime, ctx);
    await runScheduledBackupExport(env, scheduledTime + 60_000, ctx);
    expect(runWithRuntimeConnectionMock).toHaveBeenCalledTimes(2);
    expect(runWithRuntimeConnectionMock).toHaveBeenCalledWith(
      "postgres://runtime@example/db",
      expect.any(Function),
      { instrumentSql: expect.any(Function) },
    );
    expect(runBackupExportMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        scheduledAt: new Date(scheduledTime),
        instanceId: "inst_test",
      }),
    );
    expect(runBackupExportMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        scheduledAt: new Date(scheduledTime + 60_000),
      }),
    );
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
  });

  it("uses distinct actual postgres clients and isolates async-local state between scheduled events", async () => {
    const actual =
      await vi.importActual<typeof import("@insecur/tenant-store")>("@insecur/tenant-store");
    runWithRuntimeConnectionMock.mockImplementation(actual.runWithRuntimeConnection);
    const connection = await import("../../../../packages/tenant-store/src/db/connection.js");
    const clients: unknown[] = [];
    runBackupExportMock.mockImplementation(async () => {
      clients.push(connection.getRuntimeSql());
      expect(connection.activeRuntimeConnection()?.sql).toBe(clients.at(-1));
      await Promise.resolve();
      expect(connection.getRuntimeSql()).toBe(clients.at(-1));
    });
    const env = runtimeEnv();
    await runScheduledBackupExport(env, scheduledTime, ctx);
    await runScheduledBackupExport(env, scheduledTime + 60_000, ctx);
    expect(clients).toHaveLength(2);
    expect(clients[0]).not.toBe(clients[1]);
    expect(connection.activeRuntimeConnection()).toBeUndefined();
    await Promise.all(ctx.waitUntil.mock.calls.map(([closing]) => closing));
  });

  it("hands cleanup to waitUntil without blocking completion on socket shutdown", async () => {
    const closing = new Promise<void>(() => {
      /* intentionally pending shutdown */
    });
    closingMock.mockReturnValue(closing);
    await runScheduledBackupExport(runtimeEnv(), scheduledTime, ctx);
    expect(ctx.waitUntil).toHaveBeenCalledWith(closing);
  });

  it.each(["export", "root key"])(
    "propagates %s failures and still registers socket cleanup",
    async (source) => {
      const error = new Error("export failed");
      (source === "export" ? runBackupExportMock : rootKeyMock).mockRejectedValue(error);
      await expect(runScheduledBackupExport(runtimeEnv(), scheduledTime, ctx)).rejects.toBe(error);
      expect(ctx.waitUntil).toHaveBeenCalledWith(closingMock.mock.results[0]?.value);
    },
  );

  it.each(["export", "root key"])(
    "fails a hung %s before the claim lease expires and closes its client",
    async (source) => {
      vi.useFakeTimers();
      (source === "export" ? runBackupExportMock : rootKeyMock).mockReturnValue(
        new Promise(() => {
          /* simulate a stalled provider */
        }),
      );
      const result = expect(
        runScheduledBackupExport(runtimeEnv(), scheduledTime, ctx),
      ).rejects.toThrow("backup export timed out");
      await vi.advanceTimersByTimeAsync(9 * 60_000);
      await result;
      expect(ctx.waitUntil).toHaveBeenCalledWith(closingMock.mock.results[0]?.value);
      expect(Sentry.captureMessage).toHaveBeenCalledWith("backup.export_failed", {
        level: "error",
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("fails closed without the DB binding before reading custody or invoking the export", async () => {
    const env = runtimeEnv();
    Reflect.deleteProperty(env, "DB");
    await expect(runScheduledBackupExport(env, scheduledTime, ctx)).rejects.toBeInstanceOf(
      RuntimeConfigMissingError,
    );
    expect(rootKeyMock).not.toHaveBeenCalled();
    expect(runWithRuntimeConnectionMock).not.toHaveBeenCalled();
    expect(runBackupExportMock).not.toHaveBeenCalled();
  });

  it("clears the deadline after success so it cannot page or reject later", async () => {
    vi.useFakeTimers();
    await runScheduledBackupExport(runtimeEnv(), scheduledTime, ctx);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("pages through the allowlisted telemetry sink when export failure alert fires", async () => {
    runBackupExportMock.mockImplementation(async (input: { onExportFailureAlert?: () => void }) => {
      input.onExportFailureAlert?.();
    });
    await runScheduledBackupExport(runtimeEnv(), scheduledTime, ctx);
    expect(Sentry.captureMessage).toHaveBeenCalledWith("backup.export_failed", { level: "error" });
  });
});
