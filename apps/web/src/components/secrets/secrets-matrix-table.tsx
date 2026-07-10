import { Badge } from "@insecur/ui";
import type { ConsoleEnvironment } from "../../console/projects.js";
import { shortDate } from "../../console/projects.js";
import {
  secretMatrixRowHasDrift,
  type ConsoleSecretMatrixCell,
  type ConsoleSecretMatrixRow,
} from "../../console/secrets-matrix.js";
import { ActorChain } from "../actor-chain.js";

const HEADER_CELL = "px-4 py-3 text-xs font-medium tracking-widest uppercase text-muted-foreground";

function EnvironmentHeader({ environment }: { environment: ConsoleEnvironment }) {
  return (
    <th className={`${HEADER_CELL} min-w-[10rem] text-left align-bottom`}>
      <div className="flex flex-col gap-1">
        <span>{environment.displayName}</span>
        <span className="font-mono text-xs font-normal tracking-normal text-muted-foreground normal-case">
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

function PresentCell({
  cell,
  drift,
  orgId,
  projectId,
  environmentId,
}: {
  cell: ConsoleSecretMatrixCell;
  drift: boolean;
  orgId: string;
  projectId: string;
  environmentId: string;
}) {
  const content = (
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
          <ActorChain actor={cell.lastSetActor} />
        </p>
      ) : null}
    </div>
  );

  if (cell.secretId === undefined) {
    return content;
  }

  return (
    <a
      href={`/orgs/${orgId}/projects/${projectId}/envs/${environmentId}/secrets/${cell.secretId}`}
      className="block rounded-sm transition hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border"
    >
      {content}
    </a>
  );
}

function MatrixRow({
  row,
  environments,
  orgId,
  projectId,
}: {
  row: ConsoleSecretMatrixRow;
  environments: readonly ConsoleEnvironment[];
  orgId: string;
  projectId: string;
}) {
  const drift = secretMatrixRowHasDrift(row);
  const cellsByEnvironment = new Map(row.cells.map((cell) => [cell.environmentId, cell]));

  return (
    <tr
      className={`border-t border-border first:border-t-0 ${drift ? "bg-signal/5" : ""}`}
      data-drift={drift ? "true" : "false"}
    >
      <th
        scope="row"
        className={`sticky left-0 z-10 border-r border-border bg-background px-4 py-3 text-left align-top font-mono text-sm ${
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
            {cell?.present === true ? (
              <PresentCell
                cell={cell}
                drift={drift}
                orgId={orgId}
                projectId={projectId}
                environmentId={environment.environmentId}
              />
            ) : (
              <AbsentCell />
            )}
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
  orgId,
  projectId,
}: {
  environments: readonly ConsoleEnvironment[];
  rows: readonly ConsoleSecretMatrixRow[];
  orgId: string;
  projectId: string;
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[48rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className={`${HEADER_CELL} sticky left-0 z-20 bg-background`}>Secret</th>
            {environments.map((environment) => (
              <EnvironmentHeader key={environment.environmentId} environment={environment} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MatrixRow
              key={row.variableKey}
              row={row}
              environments={environments}
              orgId={orgId}
              projectId={projectId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
