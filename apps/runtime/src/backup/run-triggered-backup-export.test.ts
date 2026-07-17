import {
  BACKUP_EXPORT_PROOF_REQUEST_KEY,
  BACKUP_EXPORT_PROOF_REQUEST_VERSION,
  type BackupExportProofRequest,
} from "@insecur/backup-restore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runScheduledBackupExportMock } = vi.hoisted(() => ({
  runScheduledBackupExportMock: vi.fn(),
}));

vi.mock("./run-scheduled-backup-export.js", () => ({
  runScheduledBackupExport: runScheduledBackupExportMock,
}));

import type { RuntimeEnv } from "../env.js";
import { runTriggeredBackupExport } from "./run-triggered-backup-export.js";

const request: BackupExportProofRequest = {
  notBefore: 100,
  requestId: "request-1",
  status: "requested",
  version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
};

function r2Object(body: unknown, etag = "request-etag"): R2ObjectBody {
  return { etag, text: () => Promise.resolve(JSON.stringify(body)) } as R2ObjectBody;
}

function runtimeEnv(stored: R2ObjectBody | null, putResults: (R2Object | null)[] = []): RuntimeEnv {
  return {
    BACKUPS: {
      get: vi.fn().mockResolvedValue(stored),
      put: vi.fn().mockImplementation(() => Promise.resolve(putResults.shift() ?? null)),
    },
  } as unknown as RuntimeEnv;
}

describe("runTriggeredBackupExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runScheduledBackupExportMock.mockResolvedValue(undefined);
  });

  it("always runs the Production cron without consulting the proof request", async () => {
    const env = runtimeEnv(null);

    await runTriggeredBackupExport(env, "0 3 * * *", 42);

    expect(runScheduledBackupExportMock).toHaveBeenCalledWith(env, 42);
    expect(env.BACKUPS.get).not.toHaveBeenCalled();
  });

  it("rejects an unknown cron instead of changing export behavior", async () => {
    const env = runtimeEnv(null);

    await expect(runTriggeredBackupExport(env, "*/5 * * * *", 42)).rejects.toThrow(
      "unsupported backup export cron",
    );
    expect(runScheduledBackupExportMock).not.toHaveBeenCalled();
  });

  it("keeps an idle Preview minute trigger cheap", async () => {
    const env = runtimeEnv(null);

    await runTriggeredBackupExport(env, "* * * * *", 42);

    expect(runScheduledBackupExportMock).not.toHaveBeenCalled();
    expect(env.BACKUPS.put).not.toHaveBeenCalled();
  });

  it("leaves a request for the first cron tick at or after notBefore", async () => {
    const env = runtimeEnv(r2Object(request));

    await runTriggeredBackupExport(env, "* * * * *", 99);

    expect(env.BACKUPS.put).not.toHaveBeenCalled();
    expect(runScheduledBackupExportMock).not.toHaveBeenCalled();
  });

  it("claims one request atomically and records completion", async () => {
    const env = runtimeEnv(r2Object(request), [
      { etag: "claim-etag" } as R2Object,
      { etag: "complete-etag" } as R2Object,
    ]);

    await runTriggeredBackupExport(env, "* * * * *", 100);

    expect(env.BACKUPS.put).toHaveBeenNthCalledWith(
      1,
      BACKUP_EXPORT_PROOF_REQUEST_KEY,
      expect.stringContaining('"status":"claimed"'),
      { onlyIf: { etagMatches: "request-etag" } },
    );
    expect(runScheduledBackupExportMock).toHaveBeenCalledWith(env, 100);
    expect(env.BACKUPS.put).toHaveBeenNthCalledWith(
      2,
      BACKUP_EXPORT_PROOF_REQUEST_KEY,
      expect.stringContaining('"status":"completed"'),
      { onlyIf: { etagMatches: "claim-etag" } },
    );
  });

  it("does not export when another trigger wins the claim", async () => {
    const env = runtimeEnv(r2Object(request), [null]);

    await runTriggeredBackupExport(env, "* * * * *", 100);

    expect(runScheduledBackupExportMock).not.toHaveBeenCalled();
  });

  it("does not steal an unexpired claim", async () => {
    const env = runtimeEnv(r2Object({ ...request, status: "claimed", leaseUntil: 200 }));

    await runTriggeredBackupExport(env, "* * * * *", 199);

    expect(env.BACKUPS.put).not.toHaveBeenCalled();
    expect(runScheduledBackupExportMock).not.toHaveBeenCalled();
  });

  it("releases its claim on failure without overwriting a newer request", async () => {
    const env = runtimeEnv(r2Object(request), [{ etag: "claim-etag" } as R2Object, null]);
    runScheduledBackupExportMock.mockRejectedValue(new Error("export failed"));

    await expect(runTriggeredBackupExport(env, "* * * * *", 100)).rejects.toThrow("export failed");
    expect(env.BACKUPS.put).toHaveBeenNthCalledWith(
      2,
      BACKUP_EXPORT_PROOF_REQUEST_KEY,
      expect.stringContaining('"status":"requested"'),
      { onlyIf: { etagMatches: "claim-etag" } },
    );
  });
});
