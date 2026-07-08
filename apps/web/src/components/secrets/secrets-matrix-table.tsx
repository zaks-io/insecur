import { Badge } from "@insecur/ui";
import type { ConsoleEnvironment } from "../../console/projects.js";
import { shortDate } from "../../console/projects.js";
import { formatSecretMatrixLastSetActorLabel } from "../../console/secrets-matrix-actor.js";
import {
  secretMatrixRowHasDrift,
  type ConsoleSecretMatrixCell,
  type ConsoleSecretMatrixRow,
} from "../../console/secrets-matrix.js";

const HEADER_CELL = "px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase";

function EnvironmentHeader({ environment }: { environment: ConsoleEnvironment }) {
  return (
    <th className={`${HEADER_CELL} min-w-[10rem] text-left align-bottom`}>
      <div className="flex flex-col gap-1">
        <span>{environment.displayName}</span>
        <span className="font-mono text-[0.65rem] font-normal tracking-normal text-muted-foreground normal-case">
          {environment.lifecycleStage}
        </span>
        {environment.isProtected ? <Badge variant="solid">Protected</Badge> : null}
      </div>
    </th>
  );
}

function AbsentCell() {
  return (
    <div className="font-mono text-xs text-muted-foreground">
      <span className="font-semibold text-foreground/70">missing</span>
    </div>
  );
}

function PresentCell({ cell, drift }: { cell: ConsoleSecretMatrixCell; drift: boolean }) {
  return (
    <div className="font-mono text-xs">
      <p className={drift ? "font-semibold text-foreground" : "text-foreground"}>
        v{cell.versionNumber}
        {cell.lifecycleState !== "live" ? (
          <span className="ml-2 text-muted-foreground">({cell.lifecycleState})</span>
        ) : null}
      </p>
      {cell.lastSetAt !== undefined ? (
        <p className="mt-1 text-muted-foreground">{shortDate(cell.lastSetAt)}</p>
      ) : null}
      {cell.lastSetActor !== undefined ? (
        <p className="mt-1 text-muted-foreground">
          {formatSecretMatrixLastSetActorLabel(cell.lastSetActor)}
        </p>
      ) : null}
    </div>
  );
}

function MatrixRow({
  row,
  environments,
}: {
  row: ConsoleSecretMatrixRow;
  environments: readonly ConsoleEnvironment[];
}) {
  const drift = secretMatrixRowHasDrift(row);
  const cellsByEnvironment = new Map(row.cells.map((cell) => [cell.environmentId, cell]));

  return (
    <tr
      className={`border-t border-ink/20 first:border-t-0 ${drift ? "bg-amber-50/60" : ""}`}
      data-drift={drift ? "true" : "false"}
    >
      <th
        scope="row"
        className={`sticky left-0 z-10 border-r border-ink/20 bg-background px-4 py-3 text-left align-top font-mono text-sm ${
          drift ? "font-semibold" : "font-medium"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span>{row.variableKey}</span>
          {drift ? <Badge variant="solid">Drift</Badge> : null}
        </div>
      </th>
      {environments.map((environment) => {
        const cell = cellsByEnvironment.get(environment.environmentId);
        return (
          <td key={environment.environmentId} className="px-4 py-3 align-top">
            {cell?.present === true ? <PresentCell cell={cell} drift={drift} /> : <AbsentCell />}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Read-only secrets × environments matrix (INS-375). Metadata only: presence, version, and
 * last-set actor/time. Cross-environment drift is the headline signal; protected columns are marked.
 */
export function SecretsMatrixTable({
  environments,
  rows,
}: {
  environments: readonly ConsoleEnvironment[];
  rows: readonly ConsoleSecretMatrixRow[];
}) {
  return (
    <div className="mt-6 overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[48rem] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className={`${HEADER_CELL} sticky left-0 z-20 bg-background`}>Secret</th>
            {environments.map((environment) => (
              <EnvironmentHeader key={environment.environmentId} environment={environment} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MatrixRow key={row.variableKey} row={row} environments={environments} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
