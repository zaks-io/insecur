import {
  BACKUP_EXPORT_PROOF_REQUEST_KEY,
  BACKUP_EXPORT_PROOF_REQUEST_VERSION,
  type BackupExportProofRequest,
} from "@insecur/backup-restore";

import type { RuntimeEnv } from "../env.js";
import { runScheduledBackupExport } from "./run-scheduled-backup-export.js";

const PREVIEW_PROOF_CRON = "* * * * *";
const PRODUCTION_BACKUP_CRON = "0 3 * * *";
const CLAIM_LEASE_MS = 10 * 60_000;
/** Thrown exports (Neon cold start, transient R2) get a few retries; a wall-clock kill gets none. */
const MAX_EXPORT_ATTEMPTS = 3;

/** The requester never writes `attempts`; it appears once the trigger has claimed the request. */
interface RequestedProofRequest extends BackupExportProofRequest {
  attempts?: number;
}

interface ClaimedProofRequest extends Omit<BackupExportProofRequest, "status"> {
  attempts: number;
  leaseUntil: number;
  status: "claimed";
}

interface CompletedProofRequest extends Omit<BackupExportProofRequest, "status"> {
  status: "completed";
}

interface FailedProofRequest extends Omit<BackupExportProofRequest, "status"> {
  attempts: number;
  reason: string;
  status: "failed";
}

type StoredProofRequest =
  RequestedProofRequest | ClaimedProofRequest | CompletedProofRequest | FailedProofRequest;

const PROOF_REQUEST_STATUSES: readonly string[] = ["requested", "claimed", "completed", "failed"];

function hasProofRequestIdentity(parsed: Partial<StoredProofRequest>): boolean {
  return (
    parsed.version === BACKUP_EXPORT_PROOF_REQUEST_VERSION &&
    typeof parsed.requestId === "string" &&
    typeof parsed.notBefore === "number" &&
    PROOF_REQUEST_STATUSES.includes(parsed.status ?? "")
  );
}

function hasProofRequestStatusFields(parsed: Partial<StoredProofRequest>): boolean {
  if ("attempts" in parsed && typeof parsed.attempts !== "number") {
    return false;
  }
  if (parsed.status === "claimed") {
    return typeof parsed.leaseUntil === "number";
  }
  if (parsed.status === "failed") {
    return typeof parsed.reason === "string";
  }
  return true;
}

function parseProofRequest(value: string): StoredProofRequest {
  const parsed = JSON.parse(value) as Partial<StoredProofRequest>;
  if (!hasProofRequestIdentity(parsed) || !hasProofRequestStatusFields(parsed)) {
    throw new Error("invalid Preview backup proof request");
  }
  return parsed as StoredProofRequest;
}

function encodeProofRequest(request: StoredProofRequest): string {
  return JSON.stringify(request);
}

/** Production always exports. Preview consumes one R2 request so its minute trigger is idle otherwise. */
export async function runTriggeredBackupExport(
  env: RuntimeEnv,
  cron: string,
  scheduledTime: number,
): Promise<void> {
  if (cron === PRODUCTION_BACKUP_CRON) {
    await runScheduledBackupExport(env, scheduledTime);
    return;
  }
  if (cron !== PREVIEW_PROOF_CRON) {
    throw new Error(`unsupported backup export cron: ${cron}`);
  }

  await runRequestedPreviewExport(env, scheduledTime);
}

async function runRequestedPreviewExport(env: RuntimeEnv, scheduledTime: number): Promise<void> {
  const request = await env.BACKUPS.get(BACKUP_EXPORT_PROOF_REQUEST_KEY);
  if (request === null) {
    return;
  }
  const stored = parseProofRequest(await request.text());
  if (
    stored.status === "completed" ||
    stored.status === "failed" ||
    scheduledTime < stored.notBefore
  ) {
    return;
  }

  if (stored.status === "claimed") {
    if (scheduledTime < stored.leaseUntil) {
      return;
    }
    // A claim that outlived its lease means the Worker was killed at the scheduled-handler
    // wall-clock limit, not that the export threw. The same data set would hit the same limit, so
    // retrying only keeps the database awake; fail the request once and let the sweep report it.
    await abandonProofRequest(env, stored, request.etag, "claim lease expired");
    throw new Error(
      `Preview backup proof ${stored.requestId} abandoned: claim lease expired before the export finished`,
    );
  }

  await startRequestedExport(env, scheduledTime, stored, request.etag);
}

async function startRequestedExport(
  env: RuntimeEnv,
  scheduledTime: number,
  stored: RequestedProofRequest,
  requestEtag: string,
): Promise<void> {
  const attempts = stored.attempts ?? 0;
  if (attempts >= MAX_EXPORT_ATTEMPTS) {
    await abandonProofRequest(
      env,
      { ...stored, attempts },
      requestEtag,
      "export attempts exhausted",
    );
    throw new Error(
      `Preview backup proof ${stored.requestId} abandoned after ${String(attempts)} failed export attempts`,
    );
  }

  await claimAndExport(env, scheduledTime, { ...stored, attempts: attempts + 1 }, requestEtag);
}

async function claimAndExport(
  env: RuntimeEnv,
  scheduledTime: number,
  stored: Required<RequestedProofRequest>,
  requestEtag: string,
): Promise<void> {
  const claimed: ClaimedProofRequest = {
    attempts: stored.attempts,
    notBefore: stored.notBefore,
    requestId: stored.requestId,
    status: "claimed",
    version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
    leaseUntil: scheduledTime + CLAIM_LEASE_MS,
  };
  const claim = await env.BACKUPS.put(
    BACKUP_EXPORT_PROOF_REQUEST_KEY,
    encodeProofRequest(claimed),
    { onlyIf: { etagMatches: requestEtag } },
  );
  if (claim === null) {
    return;
  }

  try {
    await runScheduledBackupExport(env, scheduledTime);
  } catch (error) {
    await env.BACKUPS.put(
      BACKUP_EXPORT_PROOF_REQUEST_KEY,
      encodeProofRequest({ ...stored, status: "requested" }),
      { onlyIf: { etagMatches: claim.etag } },
    );
    throw error;
  }

  await env.BACKUPS.put(
    BACKUP_EXPORT_PROOF_REQUEST_KEY,
    encodeProofRequest({
      notBefore: stored.notBefore,
      requestId: stored.requestId,
      status: "completed",
      version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
    }),
    { onlyIf: { etagMatches: claim.etag } },
  );
}

async function abandonProofRequest(
  env: RuntimeEnv,
  stored: { attempts: number; notBefore: number; requestId: string },
  etag: string,
  reason: string,
): Promise<void> {
  await env.BACKUPS.put(
    BACKUP_EXPORT_PROOF_REQUEST_KEY,
    encodeProofRequest({
      attempts: stored.attempts,
      notBefore: stored.notBefore,
      reason,
      requestId: stored.requestId,
      status: "failed",
      version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
    }),
    { onlyIf: { etagMatches: etag } },
  );
}
