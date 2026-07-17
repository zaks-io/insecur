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

interface ClaimedProofRequest extends Omit<BackupExportProofRequest, "status"> {
  leaseUntil: number;
  status: "claimed";
}

interface CompletedProofRequest extends Omit<BackupExportProofRequest, "status"> {
  status: "completed";
}

type StoredProofRequest = BackupExportProofRequest | ClaimedProofRequest | CompletedProofRequest;

function parseProofRequest(value: string): StoredProofRequest {
  const parsed = JSON.parse(value) as Partial<StoredProofRequest>;
  if (
    parsed.version !== BACKUP_EXPORT_PROOF_REQUEST_VERSION ||
    typeof parsed.requestId !== "string" ||
    typeof parsed.notBefore !== "number" ||
    !["requested", "claimed", "completed"].includes(parsed.status ?? "") ||
    (parsed.status === "claimed" && typeof parsed.leaseUntil !== "number")
  ) {
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
    scheduledTime < stored.notBefore ||
    (stored.status === "claimed" && scheduledTime < stored.leaseUntil)
  ) {
    return;
  }

  const claimed: ClaimedProofRequest = {
    notBefore: stored.notBefore,
    requestId: stored.requestId,
    status: "claimed",
    version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
    leaseUntil: scheduledTime + CLAIM_LEASE_MS,
  };
  const claim = await env.BACKUPS.put(
    BACKUP_EXPORT_PROOF_REQUEST_KEY,
    encodeProofRequest(claimed),
    { onlyIf: { etagMatches: request.etag } },
  );
  if (claim === null) {
    return;
  }

  await runClaimedPreviewExport(env, scheduledTime, stored, claim);
}

async function runClaimedPreviewExport(
  env: RuntimeEnv,
  scheduledTime: number,
  stored: StoredProofRequest,
  claim: R2Object,
): Promise<void> {
  try {
    await runScheduledBackupExport(env, scheduledTime);
  } catch (error) {
    await env.BACKUPS.put(
      BACKUP_EXPORT_PROOF_REQUEST_KEY,
      encodeProofRequest({
        notBefore: stored.notBefore,
        requestId: stored.requestId,
        status: "requested",
        version: BACKUP_EXPORT_PROOF_REQUEST_VERSION,
      }),
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
