import { statusTone } from "./cell-format.js";
import { emptyState } from "./format.js";
import { renderTable, type Cell } from "./table.js";

interface VersionVerdicts {
  readonly valueByteLength: number;
  readonly encodingClass: string;
  readonly secretShapeMatchVerdict: string;
}

interface SecretVersionItem {
  readonly versionNumber: number;
  readonly lifecycleState: string;
  readonly isCurrent: boolean;
  readonly publishedAt?: string;
  readonly descriptiveVerdicts: VersionVerdicts;
}

function shapeCell(item: SecretVersionItem): Cell {
  const verdict = item.descriptiveVerdicts.secretShapeMatchVerdict;
  return { kind: "status", text: verdict, tone: statusTone(verdict) };
}

/**
 * One secret's version history as a table. Every column is lifecycle or shape
 * metadata (byte length, encoding, shape verdict) — the secret value is never
 * rendered.
 */
export function formatSecretVersionsHuman(
  variableKey: string,
  versions: readonly SecretVersionItem[],
): string {
  if (versions.length === 0) {
    return emptyState(
      `${variableKey} has no versions yet. Set a value with`,
      `insecur secrets set ${variableKey}`,
    );
  }
  return renderTable(
    [
      { header: "Version", get: (v) => ({ kind: "plain", text: `v${String(v.versionNumber)}` }) },
      {
        header: "State",
        get: (v) => ({
          kind: "status",
          text: v.lifecycleState,
          tone: statusTone(v.lifecycleState),
        }),
      },
      { header: "Current", get: (v) => ({ kind: "bool", value: v.isCurrent }) },
      { header: "Published", get: (v) => ({ kind: "time", iso: v.publishedAt }) },
      {
        header: "Bytes",
        get: (v) => ({ kind: "count", value: v.descriptiveVerdicts.valueByteLength }),
        align: "right",
      },
      {
        header: "Encoding",
        get: (v) => ({ kind: "plain", text: v.descriptiveVerdicts.encodingClass }),
      },
      { header: "Shape", get: shapeCell },
    ],
    versions,
  );
}
