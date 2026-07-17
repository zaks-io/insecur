import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessageMock, executeRestoreImportMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  executeRestoreImportMock: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    protected readonly ctx: unknown;
    protected readonly env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

vi.mock("@sentry/cloudflare", () => ({
  captureMessage: captureMessageMock,
  withSentry: (_options: unknown, entrypoint: unknown) => entrypoint,
}));

vi.mock("@insecur/observability", () => ({
  cloudflareSentryOptions: () => ({}),
}));

vi.mock("./execute-restore-import.js", () => ({
  executeRestoreImport: executeRestoreImportMock,
}));

import { RestoreImportError } from "@insecur/backup-restore";
import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";

import type { RuntimeEnv } from "../env.js";
import { RuntimeRestoreService } from "./runtime-restore-service.js";

function restoreService() {
  const ctx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
  const Service = RuntimeRestoreService as unknown as new (
    ctx: ExecutionContext,
    env: RuntimeEnv,
  ) => { restoreImport: (input: unknown) => Promise<unknown> };
  return new Service(ctx, {} as RuntimeEnv);
}

const RESTORE_INPUT = {
  artifactRef: "backup/exports/backup.export.2026-07-08T03.00.00.000Z/artifact.ibkp",
  expectedInstanceId: "inst_test",
  expectedRootKeyVersion: 1,
};

describe("RuntimeRestoreService.restoreImport failure telemetry (ADR-0084)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags the failure event with the metadata-safe backup_restore reason code", async () => {
    executeRestoreImportMock.mockRejectedValue(
      new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.notArmed, "restore target is not armed"),
    );

    const result = await restoreService().restoreImport(RESTORE_INPUT);

    expect(result).toEqual({
      ok: false,
      error: {
        code: BACKUP_RESTORE_ERROR_CODES.notArmed,
        message: "restore target is not armed",
        retryable: false,
      },
    });
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).toHaveBeenCalledWith("backup.restore_import_failed", {
      level: "error",
      tags: { backup_restore_code: BACKUP_RESTORE_ERROR_CODES.notArmed },
      extra: { backup_restore_code: BACKUP_RESTORE_ERROR_CODES.notArmed },
    });
  });

  it("tags non-restore errors with their resolved RPC code, never raw driver detail", async () => {
    executeRestoreImportMock.mockRejectedValue(new Error("connection detail must not leak"));

    const result = (await restoreService().restoreImport(RESTORE_INPUT)) as {
      ok: boolean;
      error: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).toHaveBeenCalledWith("backup.restore_import_failed", {
      level: "error",
      tags: { backup_restore_code: result.error.code },
      extra: { backup_restore_code: result.error.code },
    });
    const [, captureOptions] = captureMessageMock.mock.calls[0] as [string, object];
    expect(JSON.stringify(captureOptions)).not.toContain("connection detail must not leak");
  });

  it("does not page telemetry on success", async () => {
    executeRestoreImportMock.mockResolvedValue({ imported: true });

    const result = await restoreService().restoreImport(RESTORE_INPUT);

    expect(result).toEqual({ ok: true, value: { imported: true } });
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});
