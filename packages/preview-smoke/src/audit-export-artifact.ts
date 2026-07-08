import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { asRecord, requireString, type JsonRecord } from "./http.js";

export interface AuditExportArtifactPaths {
  readonly jsonlPath: string;
  readonly manifestPath: string;
}

/**
 * The `audit export --json` envelope carries the export bundle verbatim
 * (`{ jsonl, manifest }`, manifest fields stay snake_case from the API). Write
 * both parts to the isolated CLI workspace so `insecur audit verify` can read
 * them back exactly as an operator would from a downloaded export.
 */
export async function writeCliAuditExportArtifact(
  workspaceDir: string,
  body: JsonRecord,
  label: string,
): Promise<AuditExportArtifactPaths> {
  const data = asRecord(body.data, `${label} data`);
  const jsonl = requireString(data.jsonl, `${label} jsonl`);
  const manifest = asRecord(data.manifest, `${label} manifest`);

  const jsonlPath = join(workspaceDir, "audit-export.jsonl");
  const manifestPath = join(workspaceDir, "audit-export.manifest.json");
  await writeFile(jsonlPath, jsonl, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { jsonlPath, manifestPath };
}
