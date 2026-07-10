import { describe, expect, it } from "vitest";

import {
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
  parseBackupExportArtifactKey,
} from "../src/artifact-refs.js";
import { peekBackupArtifactHeader, sealBackupArtifact } from "../src/backup-envelope.js";
import { MemoryBackupExportStorage } from "../src/backup-export-storage.js";
import { RECOVERY_CANARY_ORGANIZATION_ID } from "../src/constants.js";
import { hashBackupArtifact } from "../src/hash-backup-artifact.js";
import { buildRestoreImportPlan } from "../src/restore-import-plan.js";
import {
  BACKUP_RESTORE_ERROR_CODES,
  RestoreImportError,
  restoreNotArmedError,
} from "../src/restore-import-error.js";
import { verifyRestoreArtifact } from "../src/verify-restore-artifact.js";
import type { BackupExportRow } from "../src/serialize-backup-row.js";
import type { BackupExportHeader, BackupExportSuccessEvidence } from "../src/types.js";

const INSTANCE_ID = "inst_restore_test";
const EXPORT_TIMESTAMP = "2026-07-08T03:00:00.000Z";
const EXPORT_IDENTITY = "backup.export.2026-07-08T03.00.00.000Z";
const OTHER_ORG_ID = "org_00000000000000000000000042";
const EXPORT_OPERATION_ID = "op_00000000000000000000000042";

function rootKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = (index * 7 + 3) % 256;
  }
  return bytes;
}

function fixtureRows(): BackupExportRow[] {
  return [
    { table: "instances", id: INSTANCE_ID, display_name: "Restore Test" },
    {
      table: "organizations",
      organization_id: RECOVERY_CANARY_ORGANIZATION_ID,
      id: RECOVERY_CANARY_ORGANIZATION_ID,
      instance_id: INSTANCE_ID,
    },
    {
      table: "organizations",
      organization_id: OTHER_ORG_ID,
      id: OTHER_ORG_ID,
      instance_id: INSTANCE_ID,
    },
    { table: "projects", organization_id: OTHER_ORG_ID, org_id: OTHER_ORG_ID, id: "prj_1" },
  ];
}

function encodeRows(rows: readonly BackupExportRow[]): Uint8Array {
  return new TextEncoder().encode(rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
}

function organizationSnapshots() {
  return [
    { organization_id: RECOVERY_CANARY_ORGANIZATION_ID, snapshot_at: EXPORT_TIMESTAMP },
    { organization_id: OTHER_ORG_ID, snapshot_at: EXPORT_TIMESTAMP },
  ];
}

async function sealFixtureArtifact(rows: readonly BackupExportRow[]): Promise<Uint8Array> {
  return sealBackupArtifact({
    instanceId: INSTANCE_ID,
    exportTimestamp: EXPORT_TIMESTAMP,
    instanceSnapshotAt: EXPORT_TIMESTAMP,
    rootKeyBytes: rootKey(),
    jsonlPayload: encodeRows(rows),
    organizationSnapshots: organizationSnapshots(),
  });
}

async function evidenceFor(
  sealed: Uint8Array,
  overrides: Partial<BackupExportSuccessEvidence> = {},
): Promise<BackupExportSuccessEvidence> {
  return {
    status: "passed",
    checked_at: EXPORT_TIMESTAMP,
    instance_id: INSTANCE_ID,
    export_timestamp: EXPORT_TIMESTAMP,
    root_key_version: 1,
    organization_count: 2,
    artifact_ref: buildBackupExportArtifactKey(EXPORT_IDENTITY),
    artifact_sha256: await hashBackupArtifact(sealed),
    encryption_verified: true,
    expires_at: "2026-07-10T03:00:00.000Z",
    operation_id: EXPORT_OPERATION_ID,
    ...overrides,
  };
}

async function storageWith(
  sealed: Uint8Array,
  evidenceOverrides: Partial<BackupExportSuccessEvidence> = {},
): Promise<MemoryBackupExportStorage> {
  const storage = new MemoryBackupExportStorage();
  storage.objects.set(buildBackupExportArtifactKey(EXPORT_IDENTITY), sealed);
  storage.objects.set(
    buildBackupExportEvidenceKey(EXPORT_IDENTITY),
    JSON.stringify(await evidenceFor(sealed, evidenceOverrides)),
  );
  return storage;
}

function verifyInput(storage: MemoryBackupExportStorage, overrides: Record<string, unknown> = {}) {
  return {
    storage,
    artifactRef: buildBackupExportArtifactKey(EXPORT_IDENTITY),
    expectedInstanceId: INSTANCE_ID,
    expectedRootKeyVersion: 1,
    boundRootKeyVersions: [1],
    rootKeyBytes: rootKey(),
    ...overrides,
  };
}

async function expectRestoreFailure(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "RestoreImportError", code });
}

describe("verifyRestoreArtifact", () => {
  it("verifies an authentic artifact and returns the grouped import plan", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());
    const storage = await storageWith(sealed);

    const verified = await verifyRestoreArtifact(verifyInput(storage));

    expect(verified.exportIdentity).toBe(EXPORT_IDENTITY);
    expect(verified.sourceExportOperationId).toBe(EXPORT_OPERATION_ID);
    expect(verified.sourceExportTimestamp).toBe(EXPORT_TIMESTAMP);
    expect(verified.plan.instanceRows).toHaveLength(1);
    expect([...verified.plan.organizationRows.keys()]).toEqual([
      RECOVERY_CANARY_ORGANIZATION_ID,
      OTHER_ORG_ID,
    ]);
    expect(verified.plan.organizationRows.get(OTHER_ORG_ID)).toHaveLength(2);
  });

  it("refuses an artifact reference outside the scheduled export key shape", async () => {
    const storage = new MemoryBackupExportStorage();
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage, { artifactRef: "backup/latest-export.ibkp" })),
      BACKUP_RESTORE_ERROR_CODES.artifactNotFound,
    );
  });

  it("refuses when no artifact exists at the reference", async () => {
    const storage = new MemoryBackupExportStorage();
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage)),
      BACKUP_RESTORE_ERROR_CODES.artifactNotFound,
    );
  });

  it("refuses a malformed envelope before any evidence lookup", async () => {
    const storage = new MemoryBackupExportStorage();
    storage.objects.set(
      buildBackupExportArtifactKey(EXPORT_IDENTITY),
      new TextEncoder().encode("not a sealed artifact"),
    );
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage)),
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
    );
  });

  it("fails fast on a header naming a different instance (advisory pre-check)", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());
    const storage = await storageWith(sealed);
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage, { expectedInstanceId: "inst_other" })),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
  });

  it("fails fast on an unexpected or unbound root key version", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());
    const storage = await storageWith(sealed);
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage, { expectedRootKeyVersion: 2 })),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage, { boundRootKeyVersions: [2] })),
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
    );
  });

  it("refuses when export success evidence is missing, mismatched, or unlinked", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());

    const noEvidence = new MemoryBackupExportStorage();
    noEvidence.objects.set(buildBackupExportArtifactKey(EXPORT_IDENTITY), sealed);
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(noEvidence)),
      BACKUP_RESTORE_ERROR_CODES.exportOperationMismatch,
    );

    const wrongHash = await storageWith(sealed, { artifact_sha256: "not-the-hash" });
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(wrongHash)),
      BACKUP_RESTORE_ERROR_CODES.exportOperationMismatch,
    );

    const evidence = await evidenceFor(sealed);
    delete evidence.operation_id;
    const noOperation = new MemoryBackupExportStorage();
    noOperation.objects.set(buildBackupExportArtifactKey(EXPORT_IDENTITY), sealed);
    noOperation.objects.set(
      buildBackupExportEvidenceKey(EXPORT_IDENTITY),
      JSON.stringify(evidence),
    );
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(noOperation)),
      BACKUP_RESTORE_ERROR_CODES.exportOperationMismatch,
    );
  });

  it("refuses a tampered header even when its evidence is regenerated (AEAD authenticity)", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());
    const tampered = tamperHeader(sealed, (header) => {
      header.export_timestamp = "2026-07-09T03:00:00.000Z";
    });
    const storage = await storageWith(tampered, {
      export_timestamp: "2026-07-09T03:00:00.000Z",
    });
    await expectRestoreFailure(
      verifyRestoreArtifact(verifyInput(storage)),
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
    );
  });
});

function tamperHeader(
  sealed: Uint8Array,
  mutate: (header: BackupExportHeader) => void,
): Uint8Array {
  const headerLength = new DataView(sealed.buffer, sealed.byteOffset + 4, 4).getUint32(0, false);
  const header = JSON.parse(
    new TextDecoder().decode(sealed.subarray(8, 8 + headerLength)),
  ) as BackupExportHeader;
  mutate(header);
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, headerBytes.byteLength, false);
  const out = new Uint8Array(
    4 + 4 + headerBytes.byteLength + (sealed.byteLength - 8 - headerLength),
  );
  out.set(sealed.subarray(0, 4), 0);
  out.set(lengthBytes, 4);
  out.set(headerBytes, 8);
  out.set(sealed.subarray(8 + headerLength), 8 + headerBytes.byteLength);
  return out;
}

describe("buildRestoreImportPlan", () => {
  function headerFixture(): BackupExportHeader {
    return {
      format_marker: "insecur-backup-v1",
      instance_id: INSTANCE_ID,
      export_timestamp: EXPORT_TIMESTAMP,
      instance_snapshot_at: EXPORT_TIMESTAMP,
      root_key_version: 1,
      dek_iv: "",
      wrapped_dek: "",
      payload_iv: "",
      organization_snapshots: organizationSnapshots(),
    };
  }

  it("refuses a table outside the export registry (unsupported export version)", () => {
    expect(() =>
      buildRestoreImportPlan(headerFixture(), [
        ...fixtureRows(),
        { table: "totally_new_table", organization_id: OTHER_ORG_ID } as never,
      ]),
    ).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.unsupportedTable }) as Error,
    );
  });

  it("refuses rows naming an organization absent from the header manifest", () => {
    expect(() =>
      buildRestoreImportPlan(headerFixture(), [
        ...fixtureRows(),
        { table: "projects", organization_id: "org_unlisted", org_id: "org_unlisted", id: "p" },
      ]),
    ).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.manifestIncomplete }) as Error,
    );
  });

  it("refuses an organization-scope row missing its organization identity", () => {
    expect(() =>
      buildRestoreImportPlan(headerFixture(), [
        ...fixtureRows(),
        { table: "projects", org_id: OTHER_ORG_ID, id: "p2" },
      ]),
    ).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.manifestIncomplete }) as Error,
    );
  });

  it("refuses a manifest organization with no organizations row in the payload", () => {
    const rows = fixtureRows().filter(
      (row) => !(row.table === "organizations" && row.id === OTHER_ORG_ID),
    );
    expect(() => buildRestoreImportPlan(headerFixture(), rows)).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.manifestIncomplete }) as Error,
    );
  });

  it("refuses an artifact without the recovery-canary sentinel organization", () => {
    const header = headerFixture();
    header.organization_snapshots = [
      { organization_id: OTHER_ORG_ID, snapshot_at: EXPORT_TIMESTAMP },
    ];
    expect(() => buildRestoreImportPlan(header, [])).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.manifestIncomplete }) as Error,
    );
  });

  it("refuses duplicate organization snapshots", () => {
    const header = headerFixture();
    header.organization_snapshots = [
      ...organizationSnapshots(),
      { organization_id: OTHER_ORG_ID, snapshot_at: EXPORT_TIMESTAMP },
    ];
    expect(() => buildRestoreImportPlan(header, [])).toThrowError(
      expect.objectContaining({ code: BACKUP_RESTORE_ERROR_CODES.manifestIncomplete }) as Error,
    );
  });
});

describe("restore artifact reference parsing", () => {
  it("round-trips scheduled export artifact keys", () => {
    expect(parseBackupExportArtifactKey(buildBackupExportArtifactKey(EXPORT_IDENTITY))).toBe(
      EXPORT_IDENTITY,
    );
  });

  it("returns null for foreign shapes", () => {
    expect(parseBackupExportArtifactKey("backup/latest-export.ibkp")).toBeNull();
    expect(parseBackupExportArtifactKey("backup/exports//artifact.ibkp")).toBeNull();
    expect(parseBackupExportArtifactKey("backup/exports/a b/artifact.ibkp")).toBeNull();
  });
});

describe("RestoreImportError", () => {
  it("carries fail-closed metadata-only codes", () => {
    const notArmed = restoreNotArmedError();
    expect(notArmed.code).toBe(BACKUP_RESTORE_ERROR_CODES.notArmed);
    expect(notArmed.retryable).toBe(false);
    expect(new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.targetNotFresh, "x").name).toBe(
      "RestoreImportError",
    );
  });
});

describe("peekBackupArtifactHeader", () => {
  it("reads the cleartext header without the root key", async () => {
    const sealed = await sealFixtureArtifact(fixtureRows());
    const header = peekBackupArtifactHeader(sealed);
    expect(header.instance_id).toBe(INSTANCE_ID);
    expect(header.root_key_version).toBe(1);
  });
});
