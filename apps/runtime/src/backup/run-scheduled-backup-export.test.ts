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

vi.mock("@insecur/backup-restore", () => ({
  runBackupExport: runBackupExportMock,
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
