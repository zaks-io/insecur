import type { ConsoleSecretsMatrix } from "../../console/secrets-matrix.js";
import { CliInvitation } from "../cli-invitation.js";
import { SecretsMatrixTable } from "./secrets-matrix-table.js";

/**
 * Project secrets sub-view (INS-375, docs/web-console-ux.md §Project Secrets View). Read-only
 * secrets × environments matrix; metadata only, values never render. Empty environments or an
 * empty Secret Shape render a CLI invitation instead of the matrix.
 *
 * The `data-slot="project-secrets"` marker must render in every state: preview smoke asserts it
 * on the SSR page regardless of whether the workspace has secrets yet
 * (packages/preview-smoke/tests/web-console.spec.ts, "Web project secrets"). Keep it stable.
 */
export function ProjectSecretsView({
  matrix,
  orgId,
  projectId,
}: {
  matrix: ConsoleSecretsMatrix;
  orgId: string;
  projectId: string;
}) {
  const { environments, rows } = matrix;

  return (
    <section data-slot="project-secrets">
      {environments.length === 0 ? (
        <CliInvitation
          title="No environments yet"
          command="insecur envs create"
          lead="The secrets matrix needs at least one environment column. Create the first environment
            for this project:"
          hint="Each column is one environment; protected environments are marked and require approval
            before secrets move."
        />
      ) : rows.length === 0 ? (
        <CliInvitation
          title="No secrets yet"
          command={`insecur secrets set --org ${orgId} --project ${projectId}`}
          lead="This project's Secret Shape is empty. Write the first secret from the CLI or your CI
            pipeline:"
          hint="The console shows presence, version, and last-set metadata only. Secret values never
            appear in the browser."
        />
      ) : (
        <SecretsMatrixTable
          environments={environments}
          rows={rows}
          orgId={orgId}
          projectId={projectId}
        />
      )}
    </section>
  );
}
