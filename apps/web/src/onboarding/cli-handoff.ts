import type { ProvisionedWorkspace } from "./provisioning.js";

export interface CliHandoffCommand {
  readonly id: string;
  /** What this command does, in one clause, set above the terminal block. */
  readonly label: string;
  /** The exact single-line text the copy affordance places on the clipboard. */
  readonly command: string;
}

/**
 * The CLI handoff sequence (docs/web-console-ux.md §First-Run Onboarding step 5), pre-filled
 * with the real opaque IDs from the provisioning response. Mirrors the documented product flow
 * in examples/first-value-proof: authenticated shell, blind write, first injected run.
 */
export function cliHandoffCommands(workspace: ProvisionedWorkspace): readonly CliHandoffCommand[] {
  const scopeFlags = `--org-id ${workspace.organizationId} --project-id ${workspace.projectId} --env-id ${workspace.environmentId}`;
  return [
    {
      id: "login",
      label: "Start an authenticated shell. Your session lives in that shell and nowhere on disk.",
      command: "insecur login --shell",
    },
    {
      id: "first-secret",
      label:
        "Write your first secret into the development environment. Generated server-side; the value never appears on screen.",
      command: `insecur secrets set ${scopeFlags} --variable-key APP_SECRET --generate random --length 32`,
    },
    {
      id: "first-run",
      label: "Run your process with the secret injected. Swap in your own command after the --.",
      command: `insecur run ${scopeFlags} --variable-key APP_SECRET -- printenv APP_SECRET > /dev/null && echo injected`,
    },
  ];
}

export interface WorkspaceReceiptRow {
  readonly label: string;
  /** Known in the live wizard flow; a reloaded handoff may only recover the organization name. */
  readonly displayName?: string;
  readonly id: string;
}

/** The metadata receipt above the commands: what exists now, by Display Name and opaque ID. */
export function workspaceReceiptRows(
  workspace: ProvisionedWorkspace,
  names: { readonly organizationName?: string; readonly projectName?: string },
): readonly WorkspaceReceiptRow[] {
  return [
    {
      label: "Organization",
      ...(names.organizationName === undefined ? {} : { displayName: names.organizationName }),
      id: workspace.organizationId,
    },
    {
      label: "Project",
      ...(names.projectName === undefined ? {} : { displayName: names.projectName }),
      id: workspace.projectId,
    },
    { label: "Environment", displayName: "Development", id: workspace.environmentId },
  ];
}
