import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";

import { buildBackupExportEvidenceKey, parseBackupExportArtifactKey } from "./artifact-refs.js";
import { openBackupArtifact, peekBackupArtifactHeader } from "./backup-envelope.js";
import type { BackupExportStorage } from "./backup-export-storage.js";
import { BACKUP_EXPORT_FORMAT_MARKER } from "./constants.js";
import { parseExportSuccessEvidence } from "./parse-evidence.js";
import { parseBackupJsonlPayload } from "./parse-backup-jsonl-payload.js";
import { RestoreImportError } from "./restore-import-error.js";
import { buildRestoreImportPlan, type RestoreImportPlan } from "./restore-import-plan.js";
import { verifyBackupExportArtifact } from "./verify-backup-export-artifact.js";
import type { BackupExportHeader } from "./types.js";

export interface VerifyRestoreArtifactInput {
  readonly storage: BackupExportStorage;
  readonly artifactRef: string;
  readonly expectedInstanceId: string;
  readonly expectedRootKeyVersion: number;
  /** Root-key versions the deploy can actually resolve (ADR-0084 advisory pre-check). */
  readonly boundRootKeyVersions: readonly number[];
  readonly rootKeyBytes: Uint8Array;
}

export interface VerifiedRestoreArtifact {
  readonly plan: RestoreImportPlan;
  readonly exportIdentity: string;
  readonly sourceExportOperationId: string;
  readonly sourceExportTimestamp: string;
}

function headerMismatch(message: string): RestoreImportError {
  return new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.headerMismatch, message);
}

/**
 * Parses the decrypted JSONL payload into rows, failing closed as `artifact_invalid` on malformed
 * JSON. Defense-in-depth: a raw V8 `SyntaxError` can embed a snippet of the DECRYPTED payload in
 * its message and would otherwise escape unwrapped as the generic cross-seam code. We drop the
 * cause and use a fixed message so no payload text can ride the error out of the Runtime, matching
 * the fail-closed shape of the sibling authenticity checks.
 */
function parseAuthenticatedPayloadRows(jsonlPayload: Uint8Array) {
  try {
    return parseBackupJsonlPayload(jsonlPayload);
  } catch {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
      "backup artifact payload is not well-formed JSONL",
    );
  }
}

/**
 * Advisory header pre-checks (ADR-0084): fail fast with a precise error before the AEAD open.
 * A passing pre-check confers NO trust — authenticity rests solely on the GCM open under the
 * AAD-bound instance ID in {@link verifyRestoreArtifact}.
 */
function assertAdvisoryHeaderPreChecks(
  header: BackupExportHeader,
  input: VerifyRestoreArtifactInput,
): void {
  if (header.format_marker !== BACKUP_EXPORT_FORMAT_MARKER) {
    throw headerMismatch("backup artifact format marker names an unsupported export version");
  }
  if (header.instance_id !== input.expectedInstanceId) {
    throw headerMismatch("backup artifact header names a different instance");
  }
  if (header.root_key_version !== input.expectedRootKeyVersion) {
    throw headerMismatch("backup artifact header names an unexpected root key version");
  }
  if (!input.boundRootKeyVersions.includes(header.root_key_version)) {
    throw headerMismatch("backup artifact root key version is not bound on this deploy");
  }
}

/**
 * Binds the artifact to its source export Operation through the immutable per-run export evidence
 * (ADR-0084 evidence linkage): the evidence object must exist, reference exactly this artifact,
 * match the opened header's instance and export timestamp, and hash-match the fetched bytes.
 */
async function resolveSourceExportOperation(input: {
  storage: BackupExportStorage;
  exportIdentity: string;
  artifactRef: string;
  sealedBytes: Uint8Array;
  header: BackupExportHeader;
}): Promise<string> {
  const mismatch = (message: string) =>
    new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.exportOperationMismatch, message);

  const serialized = await input.storage.getEvidence(
    buildBackupExportEvidenceKey(input.exportIdentity),
  );
  if (serialized === null) {
    throw mismatch("no export success evidence exists for the named artifact");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(serialized);
  } catch {
    throw mismatch("export success evidence is malformed");
  }
  const evidence = parseExportSuccessEvidence(parsedJson);
  if (evidence === null) {
    throw mismatch("export success evidence is malformed");
  }
  if (
    !(await verifyBackupExportArtifact({
      evidence,
      artifactRef: input.artifactRef,
      sealedArtifact: input.sealedBytes,
    }))
  ) {
    throw mismatch("export success evidence does not match the fetched artifact");
  }
  if (
    evidence.instance_id !== input.header.instance_id ||
    evidence.export_timestamp !== input.header.export_timestamp
  ) {
    throw mismatch("export success evidence disagrees with the artifact header");
  }
  if (evidence.operation_id === undefined) {
    throw mismatch("export success evidence carries no source export operation identity");
  }
  return evidence.operation_id;
}

/**
 * Authenticates and verifies one sealed scheduled export BEFORE any mutation (ADR-0084):
 * artifact reference shape, advisory header pre-checks, source export Operation linkage, the
 * authenticating AEAD open under the AAD-bound instance ID, and the complete table/organization
 * manifest. Returns the import plan; throws a fail-closed {@link RestoreImportError} otherwise.
 */
export async function verifyRestoreArtifact(
  input: VerifyRestoreArtifactInput,
): Promise<VerifiedRestoreArtifact> {
  const exportIdentity = parseBackupExportArtifactKey(input.artifactRef);
  if (exportIdentity === null) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactNotFound,
      "artifact reference is not a scheduled export artifact key",
    );
  }

  const sealedBytes = await input.storage.getArtifact(input.artifactRef);
  if (sealedBytes === null) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactNotFound,
      "no sealed artifact exists at the named reference",
    );
  }

  let header: BackupExportHeader;
  try {
    header = peekBackupArtifactHeader(sealedBytes);
  } catch (cause) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
      "backup artifact envelope is malformed",
      { cause },
    );
  }
  assertAdvisoryHeaderPreChecks(header, input);

  const sourceExportOperationId = await resolveSourceExportOperation({
    storage: input.storage,
    exportIdentity,
    artifactRef: input.artifactRef,
    sealedBytes,
    header,
  });

  let jsonlPayload: Uint8Array;
  try {
    const opened = await openBackupArtifact({
      instanceId: input.expectedInstanceId,
      rootKeyBytes: input.rootKeyBytes,
      sealedBytes,
    });
    header = opened.header;
    jsonlPayload = opened.jsonlPayload;
  } catch (cause) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
      "backup artifact failed authenticated decryption for this instance",
      { cause },
    );
  }

  const plan = buildRestoreImportPlan(header, parseAuthenticatedPayloadRows(jsonlPayload));
  return {
    plan,
    exportIdentity,
    sourceExportOperationId,
    sourceExportTimestamp: header.export_timestamp,
  };
}
