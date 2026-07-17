import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
  buildBackupExportIdempotencyKey,
  hashBackupArtifact,
} from "@insecur/backup-restore";
import { findMetadataSafetyViolations } from "@insecur/domain";
import { collectNoPlaintextExternalControls } from "@insecur/release-gate";
import { afterEach, describe, expect, it } from "vitest";

import { mintSmokeSentinel } from "../src/redaction";
import {
  R2_BACKUP_SWEEP_TRIGGER_CRON,
  runR2BackupSweep,
  scanObjectBytesForSentinel,
  type R2BackupSweepProvider,
} from "../src/r2-backup-sweep";
import {
  R2_BACKUP_SWEEP_EVIDENCE_ADAPTER,
  R2_BACKUP_SWEEP_EVIDENCE_RELATIVE_PATH,
  R2_BACKUP_SWEEP_SURFACE,
} from "../src/r2-backup-sweep-evidence";

const INSTANCE_ID = "ins_preview_test_instance";
const BUCKET_NAME = "insecur-preview-backups-test";
const EXPECTED_SHA = "e".repeat(40);
const DAILY_CRON = "0 3 * * *";

interface FakeProviderOptions {
  artifactBytes: Uint8Array;
  exportDelayMs?: number;
  instanceId?: string;
  mismatchedArtifactRef?: boolean;
  omitArtifactObject?: boolean;
  status?: "passed" | "failed";
  tamperArtifactAfterEvidence?: boolean;
}

interface FakeProvider extends R2BackupSweepProvider {
  scheduleWrites: string[][];
}

/**
 * Simulates the deployed export pipeline: once the trigger cron is installed, the next poll
 * exposes a fresh export (pointer, per-run evidence, sealed artifact) scheduled after install.
 */
function createFakeProvider(options: FakeProviderOptions): FakeProvider {
  const objects = new Map<string, Uint8Array>();
  let schedules = [DAILY_CRON];
  const scheduleWrites: string[][] = [];
  let exportReadyAt: number | null = null;

  const materializeExport = async () => {
    const exportTimestamp = new Date(Date.now() + (options.exportDelayMs ?? 1_000)).toISOString();
    const identity = buildBackupExportIdempotencyKey(new Date(exportTimestamp));
    const artifactRef = options.mismatchedArtifactRef
      ? buildBackupExportArtifactKey("backup.export.some-other-run")
      : buildBackupExportArtifactKey(identity);
    const evidence = {
      status: options.status ?? "passed",
      checked_at: exportTimestamp,
      instance_id: options.instanceId ?? INSTANCE_ID,
      export_timestamp: exportTimestamp,
      root_key_version: 1,
      organization_count: 3,
      artifact_ref: artifactRef,
      artifact_sha256: await hashBackupArtifact(options.artifactBytes),
      encryption_verified: (options.status ?? "passed") === "passed",
      expires_at: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      operation_id: "op_r2_sweep_fake",
    };
    const evidenceBytes = new TextEncoder().encode(JSON.stringify(evidence));
    objects.set(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, evidenceBytes);
    objects.set(buildBackupExportEvidenceKey(identity), evidenceBytes);
    if (!options.omitArtifactObject) {
      const stored = options.tamperArtifactAfterEvidence
        ? new Uint8Array([...options.artifactBytes, 0])
        : options.artifactBytes;
      objects.set(artifactRef, stored);
    }
  };

  return {
    scheduleWrites,
    async getObject(key) {
      if (exportReadyAt !== null && objects.size === 0) {
        await materializeExport();
      }
      return objects.get(key) ?? null;
    },
    readSchedules: () => Promise.resolve([...schedules]),
    writeSchedules(crons) {
      schedules = [...crons];
      scheduleWrites.push([...crons]);
      if (crons.includes(R2_BACKUP_SWEEP_TRIGGER_CRON) && exportReadyAt === null) {
        exportReadyAt = Date.now();
      }
      return Promise.resolve();
    },
  };
}

function sweepInput(provider: FakeProvider, overrides: Record<string, unknown> = {}) {
  const canaryWrites: number[] = [];
  return {
    canaryWrites,
    input: {
      bucketName: BUCKET_NAME,
      expectedInstanceId: INSTANCE_ID,
      expectedSha: EXPECTED_SHA,
      exportTimeoutMs: 500,
      pollIntervalMs: 1,
      provider,
      sentinel: mintSmokeSentinel(),
      sentinelRunId: "r2-sweep-test-run",
      sleep: () => Promise.resolve(),
      writeCanary: () => {
        canaryWrites.push(Date.now());
        return Promise.resolve();
      },
      ...overrides,
    },
  };
}

let evidenceDir: string | undefined;

afterEach(async () => {
  if (evidenceDir !== undefined) {
    await rm(evidenceDir, { force: true, recursive: true });
    evidenceDir = undefined;
  }
});

describe("scanObjectBytesForSentinel", () => {
  it("fails the negative control: finds every sentinel transport encoding in fixture bytes", () => {
    const sentinel = mintSmokeSentinel();
    for (const variant of sentinel.variants) {
      const fixture = Buffer.concat([
        randomBytes(64),
        Buffer.from(variant.pattern, "utf8"),
        randomBytes(64),
      ]);
      const findings = scanObjectBytesForSentinel("fixture.bin", fixture, sentinel);
      expect(findings.map((finding) => finding.encoding)).toContain(variant.encoding);
    }
  });

  it("reports zero findings for bytes without any sentinel encoding", () => {
    const sentinel = mintSmokeSentinel();
    expect(scanObjectBytesForSentinel("fixture.bin", randomBytes(4096), sentinel)).toEqual([]);
  });
});

describe("runR2BackupSweep", () => {
  it("passes on a sealed artifact free of sentinel encodings and emits registry-shaped evidence", async () => {
    const provider = createFakeProvider({ artifactBytes: randomBytes(2048) });
    const { input, canaryWrites } = sweepInput(provider);

    const evidence = await runR2BackupSweep(input);

    expect(canaryWrites).toHaveLength(1);
    expect(evidence.status).toBe("passed");
    expect(evidence.surface).toBe(R2_BACKUP_SWEEP_SURFACE);
    expect(evidence.evidence_adapter).toBe(R2_BACKUP_SWEEP_EVIDENCE_ADAPTER);
    expect(evidence.finding_count).toBe(0);
    expect(evidence.sentinel_run_id).toBe("r2-sweep-test-run");
    expect(evidence.expected_sha).toBe(EXPECTED_SHA);
    expect(evidence.target_ref).toMatch(
      new RegExp(`^r2://${BUCKET_NAME}/backup/exports/[^/]+/artifact\\.ibkp$`, "u"),
    );
    expect(evidence.scanned_object_count).toBe(3);
    expect(evidence.encodings_checked).toEqual(["raw", "base64", "base64url", "hex"]);
    expect(findMetadataSafetyViolations(evidence)).toEqual([]);
    // The sentinel and its encodings must never reach the evidence artifact.
    const serialized = JSON.stringify(evidence);
    for (const variant of input.sentinel.variants) {
      expect(serialized).not.toContain(variant.pattern);
    }
  });

  it("restores the committed cron schedule after a passing run and after a failure", async () => {
    const passing = createFakeProvider({ artifactBytes: randomBytes(128) });
    await runR2BackupSweep(sweepInput(passing).input);
    expect(passing.scheduleWrites.at(0)).toEqual([DAILY_CRON, R2_BACKUP_SWEEP_TRIGGER_CRON]);
    expect(passing.scheduleWrites.at(-1)).toEqual([DAILY_CRON]);

    const failing = createFakeProvider({
      artifactBytes: randomBytes(128),
      omitArtifactObject: true,
    });
    await expect(runR2BackupSweep(sweepInput(failing).input)).rejects.toThrow(/missing/u);
    expect(failing.scheduleWrites.at(-1)).toEqual([DAILY_CRON]);
  });

  it("release gate accepts the emitted evidence for no_plaintext.r2_backup", async () => {
    const provider = createFakeProvider({ artifactBytes: randomBytes(512) });
    const evidence = await runR2BackupSweep(sweepInput(provider).input);

    evidenceDir = await mkdtemp(join(tmpdir(), "r2-backup-sweep-evidence-"));
    const evidenceFile = join(evidenceDir, R2_BACKUP_SWEEP_EVIDENCE_RELATIVE_PATH);
    await mkdir(dirname(evidenceFile), { recursive: true });
    await writeFile(evidenceFile, JSON.stringify(evidence), "utf8");

    const controls = collectNoPlaintextExternalControls(evidenceDir, "small_group_production");
    const control = controls.find((entry) => entry.id === "no_plaintext.r2_backup");
    expect(control?.status).toBe("passed");
    expect(control?.blocking).toBe(false);
  });

  it("fails the negative control end to end when the artifact contains a sentinel encoding", async () => {
    const { input } = sweepInput(createFakeProvider({ artifactBytes: randomBytes(16) }));
    const leaked = Buffer.concat([
      randomBytes(32),
      Buffer.from(input.sentinel.variants[2]?.pattern ?? "", "utf8"),
      randomBytes(32),
    ]);
    const provider = createFakeProvider({ artifactBytes: leaked });
    const failingInput = { ...sweepInput(provider).input, sentinel: input.sentinel };

    let caught: Error | null = null;
    await runR2BackupSweep(failingInput).catch((error: unknown) => {
      caught = error as Error;
    });
    expect(caught).not.toBeNull();
    const message = String(caught);
    expect(message).toMatch(/sentinel encoding hit/u);
    expect(message).toContain("base64url");
    // Failure output must name encodings only, never the sentinel or its encoded forms.
    for (const variant of input.sentinel.variants) {
      expect(message).not.toContain(variant.pattern);
    }
  });

  it("rejects a missing artifact object", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      omitArtifactObject: true,
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /expected backup object is missing/u,
    );
  });

  it("rejects artifact bytes that do not match the evidence hash (incomplete scan)", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      tamperArtifactAfterEvidence: true,
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /refusing an incomplete scan/u,
    );
  });

  it("rejects export evidence naming a different instance", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      instanceId: "ins_some_other_instance",
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /different instance/u,
    );
  });

  it("rejects an artifact that does not belong to the export operation in evidence", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      mismatchedArtifactRef: true,
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /does not belong to the export operation/u,
    );
  });

  it("rejects an export run that covered the canary but did not succeed", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      status: "failed",
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /did not succeed with verified encryption/u,
    );
  });

  it("times out when no export scheduled after the canary write appears", async () => {
    const provider = createFakeProvider({
      artifactBytes: randomBytes(64),
      // Export stays scheduled before the canary write, so the sweep must never accept it.
      exportDelayMs: -60_000,
    });
    await expect(runR2BackupSweep(sweepInput(provider).input)).rejects.toThrow(
      /no backup export scheduled after the canary write/u,
    );
    expect(provider.scheduleWrites.at(-1)).toEqual([DAILY_CRON]);
  });
});
