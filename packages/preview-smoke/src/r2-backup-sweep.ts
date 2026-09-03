import { Buffer } from "node:buffer";

import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  BACKUP_EXPORT_PROOF_REQUEST_KEY,
  BACKUP_EXPORT_PROOF_REQUEST_VERSION,
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

/** Preview's committed schedule keeps the backup path continuously exercised. */
export const R2_BACKUP_SWEEP_TRIGGER_CRON = "* * * * *" as const;

const DEFAULT_POLL_INTERVAL_MS = 10_000;

/**
 * The minute trigger claims the request on the next tick and the export itself runs a little under
 * seven minutes against preview Neon, so the previous six-minute budget expired before the export
 * the sweep had just requested could possibly land (INS-642). Allow for the claim delay plus a
 * comfortable multiple of the observed export duration.
 */
const DEFAULT_EXPORT_TIMEOUT_MS = 12 * 60_000;
const DEFAULT_SCHEDULE_TIMEOUT_MS = 15 * 60_000;

/** Read-only access to R2 and the deployed Runtime schedule. */
export interface R2BackupSweepProvider {
  /** Raw object bytes, or null when the key does not exist. Bytes must never be printed. */
  getObject(key: string): Promise<Uint8Array | null>;
  requestExport(
    key: typeof BACKUP_EXPORT_PROOF_REQUEST_KEY,
    request: { notBefore: number; requestId: string; status: "requested"; version: 1 },
  ): Promise<void>;
  readSchedules(): Promise<string[]>;
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
  scheduleTimeoutMs?: number;
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

  await waitForFrequentExportSchedule(input, now, sleep);
  await input.writeCanary();
  const canaryWrittenAt = now();
  const requestId = crypto.randomUUID();
  await input.provider.requestExport(BACKUP_EXPORT_PROOF_REQUEST_KEY, {
    notBefore: canaryWrittenAt.getTime(),
    requestId,
    status: "requested",
    version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
  });

  const exportEvidence = await waitForExportAfter(
    input,
    { canaryWrittenAt, requestId },
    now,
    sleep,
  );
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

async function waitForFrequentExportSchedule(
  input: RunR2BackupSweepInput,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const timeoutMs = input.scheduleTimeoutMs ?? DEFAULT_SCHEDULE_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = now().getTime() + timeoutMs;
  for (;;) {
    const crons = await input.provider.readSchedules();
    if (crons.includes(R2_BACKUP_SWEEP_TRIGGER_CRON)) {
      return;
    }
    if (now().getTime() >= deadline) {
      throw new Error(
        `R2 backup sweep: deployed Preview Runtime is missing required ${R2_BACKUP_SWEEP_TRIGGER_CRON} trigger after ${String(timeoutMs)}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}

async function waitForExportAfter(
  input: RunR2BackupSweepInput,
  proofRequest: { canaryWrittenAt: Date; requestId: string },
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<BackupExportSuccessEvidence> {
  const { canaryWrittenAt, requestId } = proofRequest;
  const timeoutMs = input.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = now().getTime() + timeoutMs;

  for (;;) {
    const evidence = await readLatestExportEvidence(input.provider);
    if (evidence !== null && Date.parse(evidence.export_timestamp) >= canaryWrittenAt.getTime()) {
      return assertExportSucceeded(evidence);
    }
    await assertProofRequestNotAbandoned(input.provider, requestId);
    if (now().getTime() >= deadline) {
      throw new Error(
        `R2 backup sweep: no backup export scheduled after the canary write appeared within ${String(timeoutMs)}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * The Runtime records why it gave up on a proof request. Reporting that reason beats waiting out the
 * full budget and then blaming a timeout for a failure the Runtime already diagnosed. The request key
 * is shared, so only this run's own `requestId` counts: another writer's failure says nothing about
 * the export this sweep is waiting on.
 */
async function assertProofRequestNotAbandoned(
  provider: R2BackupSweepProvider,
  requestId: string,
): Promise<void> {
  const bytes = await provider.getObject(BACKUP_EXPORT_PROOF_REQUEST_KEY);
  if (bytes === null) {
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("R2 backup sweep: backup proof request is not valid JSON");
  }
  const request = raw as { reason?: unknown; requestId?: unknown; status?: unknown };
  if (request.status !== "failed" || request.requestId !== requestId) {
    return;
  }
  const reason = typeof request.reason === "string" ? request.reason : "no reason recorded";
  throw new Error(`R2 backup sweep: the Runtime abandoned the backup proof request: ${reason}`);
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
