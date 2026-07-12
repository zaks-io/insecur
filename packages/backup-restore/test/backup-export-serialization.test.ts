import { describe, expect, it } from "vitest";
import { SCHEMA_SHAPE_REGISTRY } from "@insecur/tenant-store";

import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  BACKUP_LATEST_EXPORT_ARTIFACT_KEY,
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
} from "../src/artifact-refs.js";
import {
  MemoryBackupExportStorage,
  writeBackupExportArtifact,
  writeBackupExportEvidence,
  type BackupExportStorage,
} from "../src/backup-export-storage.js";
import { publishLatestBackupExport } from "../src/publish-latest-backup-export.js";
import { concatJsonlLines } from "../src/build-backup-jsonl-payload.js";
import {
  assertBackupExportTableName,
  collectBackupExportCoverageViolations,
} from "../src/export-tables.js";
import { parseBackupJsonlPayload } from "../src/parse-backup-jsonl-payload.js";
import { encodeBackupJsonlLine, serializeBackupRow } from "../src/serialize-backup-row.js";
import type { BackupExportSuccessEvidence } from "../src/types.js";

const EXPORT_IDENTITY = "backup.export.2026-07-08T03.00.00.000Z";

function successEvidence(
  overrides: Partial<BackupExportSuccessEvidence> = {},
): BackupExportSuccessEvidence {
  return {
    status: "passed",
    checked_at: "2026-07-08T03:00:00.000Z",
    instance_id: "inst_1",
    export_timestamp: "2026-07-08T03:00:00.000Z",
    root_key_version: 1,
    organization_count: 2,
    artifact_ref: buildBackupExportArtifactKey(EXPORT_IDENTITY),
    artifact_sha256: "F3dYxqbVd3pBfVw1S73rUNra2RfN9GqYapKawP_0xJ4",
    encryption_verified: true,
    expires_at: "2026-07-09T03:00:00.000Z",
    operation_id: "op_00000000000000000000000001",
    ...overrides,
  };
}

describe("serializeBackupRow", () => {
  it("derives organization_id from org_id when present", () => {
    const row = serializeBackupRow("secrets", { org_id: "org_a", name: "db" });
    expect(row.table).toBe("secrets");
    expect(row.organization_id).toBe("org_a");
    expect(row.name).toBe("db");
  });

  it("uses the organizations row id as organization_id", () => {
    const row = serializeBackupRow("organizations", { id: "org_b", display_name: "B" });
    expect(row.organization_id).toBe("org_b");
  });

  it("omits organization_id when neither org_id nor an organizations id is present", () => {
    const row = serializeBackupRow("instances", { id: "inst_1" });
    expect(row.organization_id).toBeUndefined();
    expect(Object.hasOwn(row, "organization_id")).toBe(false);
  });

  it("does not treat a non-organizations id column as organization_id", () => {
    const row = serializeBackupRow("projects", { id: "proj_1" });
    expect(row.organization_id).toBeUndefined();
  });
});

describe("encodeBackupJsonlLine and parseBackupJsonlPayload round-trip", () => {
  it("encodes newline-terminated JSON that parses back to the same rows", () => {
    const rows = [
      serializeBackupRow("organizations", { id: "org_a" }),
      serializeBackupRow("secrets", { org_id: "org_a", name: "db" }),
    ];
    const payload = concatJsonlLines(rows.map((row) => encodeBackupJsonlLine(row)));
    const parsed = parseBackupJsonlPayload(payload);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.organization_id).toBe("org_a");
    expect(parsed[1]?.name).toBe("db");
  });

  it("returns an empty array for an empty payload", () => {
    expect(parseBackupJsonlPayload(new TextEncoder().encode(""))).toEqual([]);
    expect(parseBackupJsonlPayload(new TextEncoder().encode("   \n"))).toEqual([]);
  });

  it("ignores blank lines between records", () => {
    const payload = new TextEncoder().encode('{"table":"secrets"}\n\n{"table":"projects"}\n');
    const parsed = parseBackupJsonlPayload(payload);
    expect(parsed.map((row) => row.table)).toEqual(["secrets", "projects"]);
  });
});

describe("assertBackupExportTableName", () => {
  it("accepts an instance-scope table", () => {
    expect(assertBackupExportTableName("instances")).toBe("instances");
  });

  it("accepts an organization-scope table", () => {
    expect(assertBackupExportTableName("secrets")).toBe("secrets");
  });

  it("rejects an unknown table name", () => {
    expect(() => assertBackupExportTableName("evil_table")).toThrow(
      /unsupported backup export table/,
    );
  });
});

describe("backup export schema coverage", () => {
  it("requires every schema table to be exported or explicitly excluded", () => {
    expect(collectBackupExportCoverageViolations(Object.keys(SCHEMA_SHAPE_REGISTRY))).toEqual([]);
  });

  it("fails closed when a future schema table has no export decision", () => {
    expect(
      collectBackupExportCoverageViolations([
        ...Object.keys(SCHEMA_SHAPE_REGISTRY),
        "future_tenant_table",
      ]),
    ).toContain("schema table future_tenant_table is neither exported nor explicitly excluded");
  });
});

async function writeBackupExportArtifacts(
  storage: BackupExportStorage,
  input: {
    exportIdentity: string;
    sealedArtifact: Uint8Array;
    exportEvidence: BackupExportSuccessEvidence;
  },
): Promise<void> {
  await writeBackupExportArtifact(storage, input);
  await writeBackupExportEvidence(storage, input);
}

describe("MemoryBackupExportStorage + immutable export writes", () => {
  it("stages immutable artifact and evidence before advancing the latest evidence pointer", async () => {
    const storage = new MemoryBackupExportStorage();
    const sealedArtifact = new Uint8Array([1, 2, 3, 4]);
    const exportEvidence = successEvidence();

    await writeBackupExportArtifacts(storage, {
      exportIdentity: EXPORT_IDENTITY,
      sealedArtifact,
      exportEvidence,
    });

    expect(storage.objects.get(buildBackupExportArtifactKey(EXPORT_IDENTITY))).toBe(sealedArtifact);
    const stagedEvidence = storage.objects.get(buildBackupExportEvidenceKey(EXPORT_IDENTITY));
    expect(typeof stagedEvidence).toBe("string");
    expect(storage.objects.has(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe(false);

    await publishLatestBackupExport(storage, exportEvidence);

    const evidence = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    expect(typeof evidence).toBe("string");
    expect(JSON.parse(evidence as string).operation_id).toBe("op_00000000000000000000000001");
  });

  it("rejects evidence that carries a sensitive value before writing", async () => {
    const storage = new MemoryBackupExportStorage();
    await expect(
      writeBackupExportArtifacts(storage, {
        exportIdentity: EXPORT_IDENTITY,
        sealedArtifact: new Uint8Array([0]),
        exportEvidence: successEvidence({
          instance_id: "ghp_0123456789abcdefghijABCDEFGHIJ",
        }),
      }),
    ).rejects.toThrow(/not metadata-safe/);
    expect(storage.objects.size).toBe(0);
  });

  it("keeps existing latest pointer objects unchanged until a complete run is published", async () => {
    const storage = new MemoryBackupExportStorage();
    const previousArtifact = new Uint8Array([9, 9, 9]);
    const previousEvidence = '{"run":"previous"}\n';
    storage.objects.set(BACKUP_LATEST_EXPORT_ARTIFACT_KEY, previousArtifact);
    storage.objects.set(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, previousEvidence);

    await writeBackupExportArtifacts(storage, {
      exportIdentity: EXPORT_IDENTITY,
      sealedArtifact: new Uint8Array([1, 2, 3]),
      exportEvidence: successEvidence(),
    });

    expect(storage.objects.get(BACKUP_LATEST_EXPORT_ARTIFACT_KEY)).toBe(previousArtifact);
    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe(previousEvidence);
  });

  it("never regresses the latest pointer to an older export", async () => {
    const storage = new MemoryBackupExportStorage();
    const newer = successEvidence({ export_timestamp: "2026-07-08T03:00:00.000Z" });
    const older = successEvidence({ export_timestamp: "2026-07-07T03:00:00.000Z" });

    await publishLatestBackupExport(storage, newer);
    await publishLatestBackupExport(storage, older);

    const pointer = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    expect(JSON.parse(pointer as string)).toEqual(newer);
  });

  // This asserts the publisher's CAS control flow (re-read + recency guard on conflict) against a
  // storage double. The R2 adapter's own `onlyIf` etag precondition is a Cloudflare platform
  // guarantee exercised only against live R2 in the preview-smoke layer, not in unit tests — R2 has
  // no local emulator for conditional-put semantics, so there is deliberately no unit-level
  // R2-backed concurrency test here (three-layer strategy, docs/agents/testing.md).
  it("keeps the newer export when an older publish races the pointer advance (CAS)", async () => {
    const storage = new MemoryBackupExportStorage();
    const newer = successEvidence({ export_timestamp: "2026-07-08T03:00:00.000Z" });
    const older = successEvidence({ export_timestamp: "2026-07-07T03:00:00.000Z" });

    // Interleave read(A-old), read(B-new), write(B), write(A): the stale writer must lose its
    // compare-and-swap, re-read, and land on the recency guard instead of regressing the pointer.
    const originalGet = storage.getLatestEvidence.bind(storage);
    let staleReads = 0;
    storage.getLatestEvidence = async () => {
      staleReads += 1;
      if (staleReads === 1) {
        const preRaceSnapshot = await originalGet();
        await publishLatestBackupExport(storage, newer);
        return preRaceSnapshot;
      }
      return originalGet();
    };

    await publishLatestBackupExport(storage, older);

    const pointer = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    expect(JSON.parse(pointer as string)).toEqual(newer);
  });

  it("advances the latest pointer to a newer export and repairs a corrupt pointer", async () => {
    const storage = new MemoryBackupExportStorage();
    storage.objects.set(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, "not json");
    const first = successEvidence({ export_timestamp: "2026-07-07T03:00:00.000Z" });
    const second = successEvidence({ export_timestamp: "2026-07-08T03:00:00.000Z" });

    await publishLatestBackupExport(storage, first);
    expect(JSON.parse(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY) as string)).toEqual(
      first,
    );

    await publishLatestBackupExport(storage, second);
    expect(JSON.parse(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY) as string)).toEqual(
      second,
    );
  });
});
