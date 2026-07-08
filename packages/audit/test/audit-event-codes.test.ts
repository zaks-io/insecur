import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCESS_AUDIT_EVENT_CODES,
  APPROVALS_AUDIT_EVENT_CODES,
  AUTH_AUDIT_EVENT_CODES,
  BACKUP_AUDIT_EVENT_CODES,
  BOOTSTRAP_AUDIT_EVENT_CODES,
  CONNECTION_AUDIT_EVENT_CODES,
  CRYPTO_AUDIT_EVENT_CODES,
  findDuplicateAuditEventCodeValues,
  HIGH_ASSURANCE_AUDIT_EVENT_CODES,
  MACHINE_ACCESS_AUDIT_EVENT_CODES,
  NOTIFICATIONS_AUDIT_EVENT_CODES,
  ONBOARDING_AUDIT_EVENT_CODES,
  OPERATION_AUDIT_EVENT_CODES,
  PROTECTED_CHANGE_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_POLICY_AUDIT_EVENT_CODES,
  SECRET_FIRST_VALUE_AUDIT_EVENT_CODES,
  SECRET_PROTECTED_AUDIT_EVENT_CODES,
  SYNC_AUDIT_EVENT_CODES,
} from "../src/codes/index.js";
import {
  AUDIT_EVENT_CODES,
  FIRST_VALUE_AUDIT_EVENT_CODES,
  PRODUCTION_AUDIT_EVENT_CODES,
} from "../src/audit-event-codes.js";

const DOMAIN_AUDIT_EVENT_CODE_MODULES = [
  BOOTSTRAP_AUDIT_EVENT_CODES,
  ONBOARDING_AUDIT_EVENT_CODES,
  SECRET_FIRST_VALUE_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_AUDIT_EVENT_CODES,
  ACCESS_AUDIT_EVENT_CODES,
  AUTH_AUDIT_EVENT_CODES,
  MACHINE_ACCESS_AUDIT_EVENT_CODES,
  SYNC_AUDIT_EVENT_CODES,
  CRYPTO_AUDIT_EVENT_CODES,
  APPROVALS_AUDIT_EVENT_CODES,
  SECRET_PROTECTED_AUDIT_EVENT_CODES,
  HIGH_ASSURANCE_AUDIT_EVENT_CODES,
  BACKUP_AUDIT_EVENT_CODES,
  CONNECTION_AUDIT_EVENT_CODES,
  OPERATION_AUDIT_EVENT_CODES,
  PROTECTED_CHANGE_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_POLICY_AUDIT_EVENT_CODES,
  NOTIFICATIONS_AUDIT_EVENT_CODES,
] as const;

const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/audit-event-codes.snapshot.json",
);

function sortedCodeValues(registry: Record<string, string>): string[] {
  return [...new Set(Object.values(registry))].sort();
}

describe("audit event code registry assembly", () => {
  it("has no duplicate dotted codes across per-domain modules", () => {
    expect(findDuplicateAuditEventCodeValues(DOMAIN_AUDIT_EVENT_CODE_MODULES)).toEqual([]);
  });

  it("assembles FIRST_VALUE and PRODUCTION catalogs without duplicate dotted codes", () => {
    expect(findDuplicateAuditEventCodeValues([FIRST_VALUE_AUDIT_EVENT_CODES])).toEqual([]);
    expect(findDuplicateAuditEventCodeValues([PRODUCTION_AUDIT_EVENT_CODES])).toEqual([]);
    expect(findDuplicateAuditEventCodeValues([AUDIT_EVENT_CODES])).toEqual([]);
  });

  it("matches the pre-decomposition dotted code snapshot", () => {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as string[];
    expect(sortedCodeValues(AUDIT_EVENT_CODES)).toEqual(snapshot);
  });

  it("merges every per-domain module into the assembled registry", () => {
    const domainValues = new Set(
      DOMAIN_AUDIT_EVENT_CODE_MODULES.flatMap((module) => Object.values(module)),
    );
    const assembledValues = new Set(Object.values(AUDIT_EVENT_CODES));

    expect(assembledValues).toEqual(domainValues);
  });
});
