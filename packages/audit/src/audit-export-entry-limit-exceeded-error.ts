import { AUDIT_ERROR_CODES } from "@insecur/domain";

/** Raised when a tenant audit export request exceeds the supported entry cap. */
export class AuditExportEntryLimitExceededError extends Error {
  readonly code: typeof AUDIT_ERROR_CODES.exportEntryLimitExceeded;
  readonly maxEntryCount: number;

  constructor(maxEntryCount: number) {
    super(
      `Audit export exceeds the maximum of ${String(maxEntryCount)} entries. Narrow the time range and export in smaller windows.`,
    );
    this.name = "AuditExportEntryLimitExceededError";
    this.code = AUDIT_ERROR_CODES.exportEntryLimitExceeded;
    this.maxEntryCount = maxEntryCount;
  }
}
