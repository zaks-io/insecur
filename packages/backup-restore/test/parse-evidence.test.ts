import { describe, expect, it } from "vitest";

import { parseExportSuccessEvidence, parseRestoreDrillEvidence } from "../src/parse-evidence.js";

function validExportEvidence() {
  return {
    status: "passed",
    checked_at: "2026-07-08T03:00:00.000Z",
    instance_id: "inst_1",
    export_timestamp: "2026-07-08T03:00:00.000Z",
    root_key_version: 1,
    organization_count: 2,
    artifact_ref: "backup/latest-export.ibkp",
    encryption_verified: true,
    expires_at: "2026-07-10T03:00:00.000Z",
  };
}

function validRestoreEvidence() {
  return {
    status: "passed",
    checked_at: "2026-07-08T03:00:05.000Z",
    actor: "ci:backup-restore-drill",
    scope: {
      instance_id: "inst_1",
      organization_id: "org_00000000000000000000000001",
      project_id: "prj_00000000000000000000000001",
      environment_id: "env_00000000000000000000000001",
      secret_id: "sec_00000000000000000000000001",
    },
    rto: {
      started_at: "2026-07-08T03:00:00.000Z",
      completed_at: "2026-07-08T03:00:05.000Z",
      duration_seconds: 5,
      target_seconds: 28800,
    },
    canary_verification: {
      status: "passed",
      checked_at: "2026-07-08T03:00:05.000Z",
      variable_key: "INSECUR_RECOVERY_CANARY",
    },
    encryption_verified: true,
    artifact_ref: "backup/latest-export.ibkp",
    source_artifact_kind: "scheduled_r2_export",
    source_export_operation_id: "op_00000000000000000000000001",
    source_export_timestamp: "2026-07-08T03:00:00.000Z",
    restore_target_ref: "neon-project://fresh-restore-drill",
    restore_target_kind: "fresh_neon_project",
    import_completed_at: "2026-07-08T03:00:04.000Z",
    runtime_canary_verified_at: "2026-07-08T03:00:05.000Z",
  };
}

function withField<T extends Record<string, unknown>>(
  value: T,
  key: keyof T,
  replacement: unknown,
): T {
  if (replacement === undefined) {
    return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key)) as T;
  }
  const next = { ...value };
  next[key] = replacement as T[keyof T];
  return next;
}

describe("parseExportSuccessEvidence", () => {
  it("parses a well-formed record and carries the optional operation_id", () => {
    const parsed = parseExportSuccessEvidence({
      ...validExportEvidence(),
      operation_id: "op_00000000000000000000000001",
    });
    expect(parsed).toEqual({
      ...validExportEvidence(),
      operation_id: "op_00000000000000000000000001",
    });
  });

  it("preserves failed status and false encryption verification", () => {
    const parsed = parseExportSuccessEvidence({
      ...validExportEvidence(),
      status: "failed",
      encryption_verified: false,
    });
    expect(parsed?.status).toBe("failed");
    expect(parsed?.encryption_verified).toBe(false);
  });

  it("omits invalid optional operation_id values", () => {
    expect(
      parseExportSuccessEvidence({ ...validExportEvidence(), operation_id: "" }),
    ).not.toHaveProperty("operation_id");
    expect(
      parseExportSuccessEvidence({ ...validExportEvidence(), operation_id: 123 }),
    ).not.toHaveProperty("operation_id");
  });

  it("returns null for a non-record value", () => {
    for (const value of [null, "nope", 42, false]) {
      expect(parseExportSuccessEvidence(value)).toBeNull();
    }
  });

  it.each([
    ["status", "skipped"],
    ["status", undefined],
    ["checked_at", ""],
    ["checked_at", 1],
    ["instance_id", ""],
    ["instance_id", undefined],
    ["export_timestamp", 1],
    ["root_key_version", "1"],
    ["organization_count", "2"],
    ["artifact_ref", ""],
    ["artifact_ref", undefined],
    ["encryption_verified", "true"],
    ["expires_at", 1],
  ] as const)("returns null for invalid export field %s=%j", (key, replacement) => {
    expect(
      parseExportSuccessEvidence(withField(validExportEvidence(), key, replacement)),
    ).toBeNull();
  });
});

describe("parseRestoreDrillEvidence", () => {
  it("parses a well-formed restore drill with real restore provenance", () => {
    expect(parseRestoreDrillEvidence(validRestoreEvidence())).toEqual(validRestoreEvidence());
  });

  it("preserves failed drill and canary statuses with false encryption verification", () => {
    const parsed = parseRestoreDrillEvidence({
      ...validRestoreEvidence(),
      status: "failed",
      canary_verification: {
        ...validRestoreEvidence().canary_verification,
        status: "failed",
      },
      encryption_verified: false,
    });
    expect(parsed?.status).toBe("failed");
    expect(parsed?.canary_verification.status).toBe("failed");
    expect(parsed?.encryption_verified).toBe(false);
  });

  it("rejects invalid or missing restore_target_ref values", () => {
    expect(
      parseRestoreDrillEvidence({ ...validRestoreEvidence(), restore_target_ref: "" }),
    ).toBeNull();
    expect(
      parseRestoreDrillEvidence({ ...validRestoreEvidence(), restore_target_ref: 123 }),
    ).toBeNull();
  });

  it("returns null for a non-record or empty record value", () => {
    for (const value of [null, "nope", 42, false, []]) {
      expect(parseRestoreDrillEvidence(value)).toBeNull();
    }
  });

  it.each([
    ["status", "skipped"],
    ["status", undefined],
    ["checked_at", ""],
    ["actor", 1],
    ["scope", null],
    ["scope", "scope"],
    ["rto", null],
    ["rto", "rto"],
    ["canary_verification", null],
    ["canary_verification", "canary"],
    ["artifact_ref", ""],
    ["source_artifact_kind", "fixture"],
    ["source_export_operation_id", ""],
    ["source_export_timestamp", null],
    ["restore_target_kind", "existing_neon_project"],
    ["import_completed_at", ""],
    ["runtime_canary_verified_at", null],
    ["encryption_verified", "true"],
  ] as const)("returns null for invalid restore top-level field %s=%j", (key, replacement) => {
    expect(
      parseRestoreDrillEvidence(withField(validRestoreEvidence(), key, replacement)),
    ).toBeNull();
  });

  it.each([
    ["instance_id", ""],
    ["instance_id", undefined],
    ["organization_id", 1],
    ["project_id", ""],
    ["environment_id", null],
    ["secret_id", ""],
  ] as const)("returns null for invalid restore scope field %s=%j", (key, replacement) => {
    const evidence = validRestoreEvidence();
    expect(
      parseRestoreDrillEvidence({
        ...evidence,
        scope: withField(evidence.scope, key, replacement),
      }),
    ).toBeNull();
  });

  it.each([
    ["started_at", ""],
    ["started_at", undefined],
    ["completed_at", 1],
    ["duration_seconds", "5"],
    ["target_seconds", "28800"],
  ] as const)("returns null for invalid restore rto field %s=%j", (key, replacement) => {
    const evidence = validRestoreEvidence();
    expect(
      parseRestoreDrillEvidence({
        ...evidence,
        rto: withField(evidence.rto, key, replacement),
      }),
    ).toBeNull();
  });

  it.each([
    ["status", "skipped"],
    ["status", undefined],
    ["checked_at", ""],
    ["checked_at", 1],
    ["variable_key", ""],
    ["variable_key", undefined],
  ] as const)("returns null for invalid canary field %s=%j", (key, replacement) => {
    const evidence = validRestoreEvidence();
    expect(
      parseRestoreDrillEvidence({
        ...evidence,
        canary_verification: withField(evidence.canary_verification, key, replacement),
      }),
    ).toBeNull();
  });
});
