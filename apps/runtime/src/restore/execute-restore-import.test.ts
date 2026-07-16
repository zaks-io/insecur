import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/backup-restore";
import type { RuntimeRpc } from "@insecur/worker-kit";
import { describe, expect, it, vi } from "vitest";

import { runtimeEnvFixture } from "../test-support/runtime-env-fixture.js";
import { executeRestoreImport, type RestoreArmableEnv } from "./execute-restore-import.js";

function executionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
}

function restoreInput(overrides: Record<string, unknown> = {}) {
  return {
    artifactRef: "backup/exports/backup.export.2026-07-08T03.00.00.000Z/artifact.ibkp",
    expectedInstanceId: "inst_test",
    expectedRootKeyVersion: 1,
    ...overrides,
  };
}

async function expectRestoreFailure(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "RestoreImportError", code });
}

describe("executeRestoreImport arming guards", () => {
  it("fails closed with restore_not_armed when RESTORE_DB is absent (every normal deploy)", async () => {
    const env = runtimeEnvFixture() as RestoreArmableEnv;
    await expectRestoreFailure(
      executeRestoreImport(env, executionContext(), restoreInput()),
      BACKUP_RESTORE_ERROR_CODES.notArmed,
    );
  });

  it("refuses a RESTORE_DB binding pointing at the normal database target", async () => {
    const env = {
      ...runtimeEnvFixture(),
      RESTORE_DB: { connectionString: "postgres://localhost/test" } as Hyperdrive,
    } as RestoreArmableEnv;
    await expectRestoreFailure(
      executeRestoreImport(env, executionContext(), restoreInput()),
      BACKUP_RESTORE_ERROR_CODES.targetIsLive,
    );
  });

  it("fails fast when the expected instance does not match the deploy", async () => {
    const env = {
      ...runtimeEnvFixture(),
      RESTORE_DB: { connectionString: "postgres://localhost/restore_target" } as Hyperdrive,
    } as RestoreArmableEnv;
    await expectRestoreFailure(
      executeRestoreImport(
        env,
        executionContext(),
        restoreInput({ expectedInstanceId: "inst_other" }),
      ),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
  });

  it("rejects malformed operator input before touching any binding", async () => {
    const env = runtimeEnvFixture() as RestoreArmableEnv;
    await expectRestoreFailure(
      executeRestoreImport(env, executionContext(), restoreInput({ artifactRef: "" })),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
    await expectRestoreFailure(
      executeRestoreImport(
        env,
        executionContext(),
        restoreInput({ expectedRootKeyVersion: "1" as never }),
      ),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
  });
});

// ADR-0084 reachability: the API/Web-facing RuntimeService contract must never grow a restore
// method. This resolves to `never` (and fails tsc) if `restoreImport` joins `RuntimeRpc`.
type RestoreIsNotOnRuntimeRpc = "restoreImport" extends keyof RuntimeRpc ? never : true;
const restoreIsNotOnRuntimeRpc: RestoreIsNotOnRuntimeRpc = true;

describe("RuntimeService contract", () => {
  it("does not expose restoreImport to the API/Web binding surface", () => {
    expect(restoreIsNotOnRuntimeRpc).toBe(true);
  });
});
