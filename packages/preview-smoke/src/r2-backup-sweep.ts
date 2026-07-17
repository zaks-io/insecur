import { Buffer } from "node:buffer";

import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  buildBackupExportEvidenceKey,
  buildBackupExportIdempotencyKey,
  hashBackupArtifact,
  parseBackupExportArtifactKey,
  parseExportSuccessEvidence,
  type BackupExportSuccessEvidence,
} from "@insecur/backup-restore";
import type { Sentinel } from "./redaction";
import { buildR2BackupSweepEvidence, type R2BackupSweepEvidence } from "./r2-backup-sweep-evidence";

/**
 * Real-R2 no-plaintext sweep of the scheduled backup artifact (INS-562, ADR-0069 §external
 * evidence). The sweep writes a fresh canary Sensitive Value through the live preview API,
 * drives the existing scheduled export action on the deployed Runtime Worker so the artifact
 * provably covers the canary, downloads the sealed artifact through the real Cloudflare/R2
 * boundary, and searches its bytes for every ADR-0069 sentinel encoding. Sentinel values,
 * encodings, and object bytes never reach output or evidence — only counts and references do.
 */

/**
 * Temporary every-minute cron added on top of the committed daily schedule so the existing
 * scheduled export handler fires inside the smoke window. Always removed again in `finally`;
 * any preview deploy also restores the committed schedule from wrangler config.
 */
export const R2_BACKUP_SWEEP_TRIGGER_CRON = "* * * * *" as const;

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_EXPORT_TIMEOUT_MS = 6 * 60_000;

/** Read-only R2 access plus the schedule nudge that drives the existing export action. */
export interface R2BackupSweepProvider {
  /** Raw object bytes, or null when the key does not exist. Bytes must never be printed. */
  getObject(key: string): Promise<Uint8Array | null>;
  readSchedules(): Promise<string[]>;
  writeSchedules(crons: readonly string[]): Promise<void>;
}

export interface R2BackupSweepFinding {
  encoding: string;
  objectKey: string;
}

export interface RunR2BackupSweepInput {
  bucketName: string;
  expectedInstanceId: string;
  expectedSha: string;
  exportTimeoutMs?: number;
  now?: () => Date;
  pollIntervalMs?: number;
  provider: R2BackupSweepProvider;
  sentinel: Sentinel;
  sentinelRunId: string;
  sleep?: (ms: number) => Promise<void>;
  /** Writes the fresh canary Sensitive Value through the live preview API. */
  writeCanary: () => Promise<void>;
}

/**
 * Byte-level search of one object for every sentinel transport encoding (raw, base64,
 * base64url, hex — the exact ADR-0069 set carried by `Sentinel.variants`). Returns
 * metadata-only findings; the matched bytes are never surfaced.
 */
export function scanObjectBytesForSentinel(
  objectKey: string,
  bytes: Uint8Array,
  sentinel: Sentinel,
): R2BackupSweepFinding[] {
  const haystack = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const findings: R2BackupSweepFinding[] = [];
  for (const variant of sentinel.variants) {
    if (haystack.includes(Buffer.from(variant.pattern, "utf8"))) {
      findings.push({ encoding: variant.encoding, objectKey });
    }
  }
  return findings;
}

export async function runR2BackupSweep(
  input: RunR2BackupSweepInput,
): Promise<R2BackupSweepEvidence> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((ms: number) => new Promise((res) => setTimeout(res, ms)));

  await input.writeCanary();
  const canaryWrittenAt = now();

  const exportEvidence = await driveFreshExport(input, canaryWrittenAt, now, sleep);
  assertExportMatchesOperation(exportEvidence, input.expectedInstanceId);

  const scanned = await downloadAndScanExportObjects(input, exportEvidence);

  return buildR2BackupSweepEvidence({
    artifactSha256: exportEvidence.artifact_sha256,
    bucketName: input.bucketName,
    artifactRef: exportEvidence.artifact_ref,
    checkedAt: now().toISOString(),
    encodingsChecked: input.sentinel.variants.map((variant) => variant.encoding),
    expectedSha: input.expectedSha,
    exportTimestamp: exportEvidence.export_timestamp,
    scannedByteCount: scanned.scannedByteCount,
    scannedObjectCount: scanned.scannedObjectCount,
    sentinelRunId: input.sentinelRunId,
  });
}

/**
 * Adds the temporary trigger cron so the existing scheduled export action fires, then waits for
 * the latest-export pointer to advance to a run scheduled after the canary write. The committed
 * schedule is always restored, including on failure.
 */
async function driveFreshExport(
  input: RunR2BackupSweepInput,
  canaryWrittenAt: Date,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<BackupExportSuccessEvidence> {
  const originalCrons = await input.provider.readSchedules();
  const withTrigger = originalCrons.includes(R2_BACKUP_SWEEP_TRIGGER_CRON)
    ? originalCrons
    : [...originalCrons, R2_BACKUP_SWEEP_TRIGGER_CRON];
  await input.provider.writeSchedules(withTrigger);
  try {
    return await waitForExportAfter(input, canaryWrittenAt, now, sleep);
  } finally {
    await input.provider.writeSchedules(originalCrons);
  }
}

async function waitForExportAfter(
  input: RunR2BackupSweepInput,
  canaryWrittenAt: Date,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<BackupExportSuccessEvidence> {
  const timeoutMs = input.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = now().getTime() + timeoutMs;

  for (;;) {
    const evidence = await readLatestExportEvidence(input.provider);
    if (evidence !== null && Date.parse(evidence.export_timestamp) >= canaryWrittenAt.getTime()) {
      return assertExportSucceeded(evidence);
    }
    if (now().getTime() >= deadline) {
      throw new Error(
        `R2 backup sweep: no backup export scheduled after the canary write appeared within ${String(timeoutMs)}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}

function assertExportSucceeded(evidence: BackupExportSuccessEvidence): BackupExportSuccessEvidence {
  if (evidence.status !== "passed" || !evidence.encryption_verified) {
    throw new Error(
      "R2 backup sweep: the export run covering the canary write did not succeed with verified encryption",
    );
  }
  return evidence;
}

async function readLatestExportEvidence(
  provider: R2BackupSweepProvider,
): Promise<BackupExportSuccessEvidence | null> {
  const bytes = await provider.getObject(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
  if (bytes === null) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("R2 backup sweep: latest-export evidence pointer is not valid JSON");
  }
  return parseExportSuccessEvidence(raw);
}

/**
 * The evidence must name this preview instance and its artifact reference must belong to the
 * exact export operation the evidence claims: the artifact key's export identity is the
 * idempotency key derived from the scheduled timestamp (ADR-0066/ADR-0072).
 */
function assertExportMatchesOperation(
  evidence: BackupExportSuccessEvidence,
  expectedInstanceId: string,
): void {
  if (evidence.instance_id !== expectedInstanceId) {
    throw new Error("R2 backup sweep: export evidence names a different instance");
  }
  const exportIdentity = parseBackupExportArtifactKey(evidence.artifact_ref);
  if (exportIdentity === null) {
    throw new Error("R2 backup sweep: export evidence artifact_ref is not a backup artifact key");
  }
  const expectedIdentity = buildBackupExportIdempotencyKey(new Date(evidence.export_timestamp));
  if (exportIdentity !== expectedIdentity) {
    throw new Error(
      "R2 backup sweep: export artifact does not belong to the export operation in evidence",
    );
  }
}

async function downloadAndScanExportObjects(
  input: RunR2BackupSweepInput,
  evidence: BackupExportSuccessEvidence,
): Promise<{ scannedByteCount: number; scannedObjectCount: number }> {
  const exportIdentity = parseBackupExportArtifactKey(evidence.artifact_ref);
  // Guarded by assertExportMatchesOperation before this point.
  if (exportIdentity === null) {
    throw new Error("R2 backup sweep: export evidence artifact_ref is not a backup artifact key");
  }

  const artifactBytes = await requireObject(input.provider, evidence.artifact_ref);
  const actualSha256 = await hashBackupArtifact(artifactBytes);
  if (actualSha256 !== evidence.artifact_sha256) {
    throw new Error(
      "R2 backup sweep: downloaded artifact bytes do not match the evidence artifact hash; refusing an incomplete scan",
    );
  }

  const scanTargets: { bytes: Uint8Array; key: string }[] = [
    { bytes: artifactBytes, key: evidence.artifact_ref },
    {
      bytes: await requireObject(input.provider, buildBackupExportEvidenceKey(exportIdentity)),
      key: buildBackupExportEvidenceKey(exportIdentity),
    },
    {
      bytes: await requireObject(input.provider, BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY),
      key: BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
    },
  ];

  const findings = scanTargets.flatMap((target) =>
    scanObjectBytesForSentinel(target.key, target.bytes, input.sentinel),
  );
  if (findings.length > 0) {
    const summary = findings
      .map((finding) => `${finding.objectKey} (${finding.encoding})`)
      .join(", ");
    throw new Error(
      `R2 backup sweep FAILED: ${String(findings.length)} sentinel encoding hit(s) in backup objects: ${summary}`,
    );
  }

  return {
    scannedByteCount: scanTargets.reduce((total, target) => total + target.bytes.byteLength, 0),
    scannedObjectCount: scanTargets.length,
  };
}

async function requireObject(provider: R2BackupSweepProvider, key: string): Promise<Uint8Array> {
  const bytes = await provider.getObject(key);
  if (bytes === null) {
    throw new Error(`R2 backup sweep: expected backup object is missing: ${key}`);
  }
  return bytes;
}
