import { describe, expect, it } from "vitest";

import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  BACKUP_LATEST_EXPORT_ARTIFACT_KEY,
} from "../src/artifact-refs.js";
import {
  MemoryBackupExportStorage,
  writeBackupExportArtifacts,
} from "../src/backup-export-storage.js";
import { concatJsonlLines } from "../src/build-backup-jsonl-payload.js";
import { assertBackupExportTableName } from "../src/export-tables.js";
import { parseBackupJsonlPayload } from "../src/parse-backup-jsonl-payload.js";
import { encodeBackupJsonlLine, serializeBackupRow } from "../src/serialize-backup-row.js";
import type { BackupExportSuccessEvidence } from "../src/types.js";

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
    artifact_ref: "backup/latest-export.ibkp",
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

describe("MemoryBackupExportStorage + writeBackupExportArtifacts", () => {
  it("stores the sealed artifact and metadata-safe evidence under the R2 keys", async () => {
    const storage = new MemoryBackupExportStorage();
    const sealedArtifact = new Uint8Array([1, 2, 3, 4]);

    await writeBackupExportArtifacts(storage, {
      sealedArtifact,
      exportEvidence: successEvidence(),
    });

    expect(storage.objects.get(BACKUP_LATEST_EXPORT_ARTIFACT_KEY)).toBe(sealedArtifact);
    const evidence = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    expect(typeof evidence).toBe("string");
    expect(JSON.parse(evidence as string).operation_id).toBe("op_00000000000000000000000001");
  });

  it("rejects evidence that carries a sensitive value before writing", async () => {
    const storage = new MemoryBackupExportStorage();
    await expect(
      writeBackupExportArtifacts(storage, {
        sealedArtifact: new Uint8Array([0]),
        exportEvidence: successEvidence({
          instance_id: "ghp_0123456789abcdefghijABCDEFGHIJ",
        }),
      }),
    ).rejects.toThrow(/not metadata-safe/);
    expect(storage.objects.size).toBe(0);
  });
});
