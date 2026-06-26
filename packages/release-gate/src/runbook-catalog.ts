import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Sections every production security runbook must include (ADR-0008, INS-93). */
export const REQUIRED_RUNBOOK_SECTIONS = [
  "purpose",
  "when_to_use",
  "dry_run",
  "execute",
  "verify",
  "expected_audit",
  "recovery",
  "no_reveal_handling",
  "evidence",
] as const;

export type RequiredRunbookSection = (typeof REQUIRED_RUNBOOK_SECTIONS)[number];

export interface CatalogedRunbook {
  readonly id: string;
  readonly path: string;
  readonly profile: "small_group_production" | "production_deploy";
}

/**
 * Runbooks required by INS-93 (ARG-04) plus previously landed catalog entries
 * referenced by `runbook.catalog` acceptance.
 */
export const RUNBOOK_CATALOG: readonly CatalogedRunbook[] = [
  {
    id: "instance-root-key-bootstrap",
    path: "docs/runbooks/instance-root-key-bootstrap.md",
    profile: "small_group_production",
  },
  {
    id: "custody-material-compromise",
    path: "docs/runbooks/custody-material-compromise.md",
    profile: "small_group_production",
  },
  {
    id: "storage-security-gate-failure",
    path: "docs/runbooks/storage-security-gate-failure.md",
    profile: "small_group_production",
  },
  {
    id: "neon-postgres-restore-from-encrypted-backup",
    path: "docs/runbooks/neon-postgres-restore-from-encrypted-backup.md",
    profile: "small_group_production",
  },
  {
    id: "audit-export-and-verification",
    path: "docs/runbooks/audit-export-and-verification.md",
    profile: "small_group_production",
  },
  {
    id: "machine-identity-credential-compromise",
    path: "docs/runbooks/machine-identity-credential-compromise.md",
    profile: "small_group_production",
  },
  {
    id: "app-connection-compromise-or-disconnect",
    path: "docs/runbooks/app-connection-compromise-or-disconnect.md",
    profile: "small_group_production",
  },
  {
    id: "protected-approval-incident",
    path: "docs/runbooks/protected-approval-incident.md",
    profile: "small_group_production",
  },
  {
    id: "release-gate-failure",
    path: "docs/runbooks/release-gate-failure.md",
    profile: "production_deploy",
  },
] as const;

export function resolveRepoPath(repoRoot: string, relativePath: string): string {
  return resolve(repoRoot, relativePath);
}

export function readRunbook(repoRoot: string, relativePath: string): string {
  return readFileSync(resolveRepoPath(repoRoot, relativePath), "utf8");
}

export function findMissingRunbookSections(content: string): RequiredRunbookSection[] {
  const missing: RequiredRunbookSection[] = [];

  for (const section of REQUIRED_RUNBOOK_SECTIONS) {
    const pattern = new RegExp(`^## ${section}\\s*$`, "m");
    if (!pattern.test(content)) {
      missing.push(section);
    }
  }

  return missing;
}

export interface RunbookCatalogViolation {
  readonly runbookId: string;
  readonly path: string;
  readonly kind: "missing_file" | "missing_section";
  readonly detail: string;
}

export function collectRunbookCatalogViolations(repoRoot: string): RunbookCatalogViolation[] {
  const violations: RunbookCatalogViolation[] = [];

  for (const entry of RUNBOOK_CATALOG) {
    let content: string;
    try {
      content = readRunbook(repoRoot, entry.path);
    } catch {
      violations.push({
        runbookId: entry.id,
        path: entry.path,
        kind: "missing_file",
        detail: "runbook file is missing",
      });
      continue;
    }

    const missingSections = findMissingRunbookSections(content);
    for (const section of missingSections) {
      violations.push({
        runbookId: entry.id,
        path: entry.path,
        kind: "missing_section",
        detail: `missing required section: ${section}`,
      });
    }
  }

  return violations;
}
