import type { ReleaseGateControl } from "./types.js";
import { blockedControl, missingControl, passedControl } from "./control-helpers.js";
import { evidencePath, parseJsonEvidence } from "./read-evidence.js";
import { parseChecklistEvidence } from "./parse-checklist-evidence.js";
import type { ChecklistEvidence } from "./types.js";

function checklistProgress(evidence: ChecklistEvidence): string {
  if (evidence.completed_items !== undefined && evidence.total_items !== undefined) {
    return `${String(evidence.completed_items)}/${String(evidence.total_items)} items complete`;
  }

  return "checklist status recorded";
}

export function collectChecklistControl(
  evidenceDir: string,
  id: "auth.asvs_checklist" | "auth.api_top10_checklist",
  relativePath: string,
  label: string,
): ReleaseGateControl {
  const docs = ["docs/security-runbooks-and-release-gates.md", "docs/security-plan.md"];
  const evidence = parseJsonEvidence(
    evidencePath(evidenceDir, relativePath),
    parseChecklistEvidence,
  );

  if (!evidence) {
    return missingControl(id, `${label} evidence is missing.`, docs, relativePath);
  }

  const refs: ReleaseGateControl["evidence"] = [{ kind: "file", path: relativePath }];
  if (evidence.checklist_ref) {
    refs.push({ kind: "file", path: evidence.checklist_ref });
  }

  const progress = checklistProgress(evidence);
  const input = {
    id,
    docs,
    evidence: refs,
    checkedAt: evidence.checked_at,
  };

  if (evidence.status === "missing_evidence") {
    return missingControl(id, `${label} is not complete.`, docs, relativePath);
  }

  if (evidence.status === "blocked") {
    return blockedControl({
      ...input,
      summary: `${label} is blocked (${progress}).`,
    });
  }

  return passedControl({
    ...input,
    summary: `${label} passed (${progress}).`,
  });
}

export function collectChecklistControls(evidenceDir: string): ReleaseGateControl[] {
  return [
    collectChecklistControl(
      evidenceDir,
      "auth.asvs_checklist",
      "security/asvs-checklist.json",
      "OWASP ASVS checklist",
    ),
    collectChecklistControl(
      evidenceDir,
      "auth.api_top10_checklist",
      "security/api-top10-checklist.json",
      "OWASP API Security Top 10 checklist",
    ),
  ];
}
