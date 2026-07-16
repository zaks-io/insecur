import type { RestoreImportPlan } from "./restore-import-plan.js";
import type { BackupExportRow } from "./serialize-backup-row.js";

function organizationCompositeKey(instanceId: unknown, organizationId: unknown): string | null {
  if (typeof instanceId !== "string" || typeof organizationId !== "string") {
    return null;
  }
  return `${instanceId} ${organizationId}`;
}

/**
 * The set of `(instance_id, id)` pairs for every organizations row actually imported. The composite
 * FK `bootstrap_claims_instance_first_org_fkey` targets this pair, so it is the membership test for
 * whether a bootstrap claim's referenced organization survived the import.
 */
export function importedOrganizationKeys(plan: RestoreImportPlan): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const rows of plan.organizationRows.values()) {
    for (const row of rows) {
      const key =
        row.table === "organizations" ? organizationCompositeKey(row.instance_id, row.id) : null;
      if (key !== null) {
        keys.add(key);
      }
    }
  }
  return keys;
}

export interface PartitionedInstanceRows {
  readonly importableRows: BackupExportRow[];
  readonly droppedBootstrapClaimCount: number;
}

/**
 * Partitions instance-scope rows into importable rows and torn-read orphans. The export is not one
 * transactional snapshot (ADR-0072): a `bootstrap_operator_claims` row can reference — through its
 * NOT NULL composite FK to `organizations(instance_id, id)` — an organization whose row was not
 * captured in the same export (e.g. deleted between the org enumeration and the instance-scope
 * read). Importing such a claim violates the FK, so an orphan is dropped as a no-op and counted,
 * the same torn-read tolerance the plan applies to vanished organizations. In a production restore
 * of a single internally-consistent instance nothing is ever dropped.
 */
export function partitionInstanceRows(
  instanceRows: readonly BackupExportRow[],
  importedOrganizations: ReadonlySet<string>,
): PartitionedInstanceRows {
  const importableRows: BackupExportRow[] = [];
  let droppedBootstrapClaimCount = 0;
  for (const row of instanceRows) {
    if (row.table === "bootstrap_operator_claims") {
      const key = organizationCompositeKey(row.instance_id, row.first_organization_id);
      if (key === null || !importedOrganizations.has(key)) {
        droppedBootstrapClaimCount += 1;
        continue;
      }
    }
    importableRows.push(row);
  }
  return { importableRows, droppedBootstrapClaimCount };
}
