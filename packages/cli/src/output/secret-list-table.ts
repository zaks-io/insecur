import type { EnvironmentId } from "@insecur/domain";
import { statusTone } from "./cell-format.js";
import { emptyState } from "./format.js";
import { renderTable, type Cell } from "./table.js";

interface SecretVersionSummary {
  readonly versionNumber: number;
  readonly lifecycleState: string;
  readonly publishedAt?: string;
}

interface SecretListItem {
  readonly variableKey: string;
  readonly secretId: string;
  readonly currentVersion?: SecretVersionSummary;
}

function versionCell(item: SecretListItem): Cell {
  return item.currentVersion === undefined
    ? { kind: "plain", text: "—" }
    : { kind: "plain", text: `v${String(item.currentVersion.versionNumber)}` };
}

function stateCell(item: SecretListItem): Cell {
  const state = item.currentVersion?.lifecycleState;
  return state === undefined
    ? { kind: "plain", text: "—" }
    : { kind: "status", text: state, tone: statusTone(state) };
}

/** `secrets list` as a table of what exists and its lifecycle — never a value. */
export function formatSecretListHuman(
  secrets: readonly SecretListItem[],
  envId: EnvironmentId,
): string {
  if (secrets.length === 0) {
    return emptyState(
      `No secrets in ${envId} yet. Add one with`,
      "insecur secrets set <VARIABLE_KEY>",
    );
  }
  return renderTable(
    [
      {
        header: "Variable",
        get: (item) => ({ kind: "plain", text: item.variableKey, untrusted: true }),
      },
      { header: "Version", get: versionCell },
      { header: "State", get: stateCell },
      {
        header: "Published",
        get: (item) => ({ kind: "time", iso: item.currentVersion?.publishedAt }),
      },
      { header: "Secret ID", get: (item) => ({ kind: "id", text: item.secretId }) },
    ],
    secrets,
  );
}
