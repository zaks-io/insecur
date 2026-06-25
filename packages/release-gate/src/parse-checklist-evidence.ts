import type { ChecklistEvidence } from "./types.js";
import { asRecord, hasOneOf, readNumber, readString } from "./evidence-parsers.js";

export function parseChecklistEvidence(value: unknown): ChecklistEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "blocked", "missing_evidence"] as const);
  if (!status) {
    return null;
  }

  const evidence: ChecklistEvidence = { status };
  applyOptionalChecklistFields(record, evidence);
  return evidence;
}

function applyOptionalChecklistFields(
  record: Record<string, unknown>,
  evidence: ChecklistEvidence,
): void {
  const checkedAt = readString(record, "checked_at");
  const checklistRef = readString(record, "checklist_ref");
  const completedItems = readNumber(record, "completed_items");
  const totalItems = readNumber(record, "total_items");

  if (checkedAt) {
    evidence.checked_at = checkedAt;
  }
  if (checklistRef) {
    evidence.checklist_ref = checklistRef;
  }
  if (completedItems !== null) {
    evidence.completed_items = completedItems;
  }
  if (totalItems !== null) {
    evidence.total_items = totalItems;
  }
}
