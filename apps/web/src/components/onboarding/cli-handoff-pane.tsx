import { Button } from "@insecur/ui";
import { Link } from "@tanstack/react-router";
import { cliHandoffCommands, workspaceReceiptRows } from "../../onboarding/cli-handoff.js";
import type { ProvisionedWorkspace } from "../../onboarding/provisioning.js";
import { CommandBlock } from "./command-block.js";
import { MetadataReceipt } from "./metadata-receipt.js";

/**
 * Step 5, the wizard's destination: a metadata receipt for what now exists, then the terminal
 * sequence pre-filled with the real opaque IDs (docs/web-console-ux.md §First-Run Onboarding).
 * Reachable again via `/onboarding?org&project&env`, so losing the tab loses nothing.
 */
export function CliHandoffPane({
  workspace,
  organizationName,
  projectName,
}: {
  workspace: ProvisionedWorkspace;
  organizationName?: string | undefined;
  projectName?: string | undefined;
}) {
  const rows = workspaceReceiptRows(workspace, {
    ...(organizationName === undefined ? {} : { organizationName }),
    ...(projectName === undefined ? {} : { projectName }),
  });

  return (
    <div className="border-2 border-ink">
      <div className="border-b-2 border-ink px-6 py-6">
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">
          Ready. The CLI takes it from here.
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Everything on this receipt already exists, addressed by its ID. The commands below are
          pre-filled with those IDs; paste them into your terminal as they are.
        </p>
      </div>
      <MetadataReceipt rows={rows} />
      <section aria-label="Terminal commands" className="flex flex-col gap-5 px-6 py-6">
        <h3 className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          In your terminal
        </h3>
        {cliHandoffCommands(workspace).map((entry) => (
          <CommandBlock key={entry.id} entry={entry} />
        ))}
      </section>
      <div className="flex flex-col gap-3 border-t-2 border-ink px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Keep this tab around, or find these IDs any time in your console.
        </p>
        <Button asChild variant="outline">
          <Link to="/orgs/$orgId" params={{ orgId: workspace.organizationId }}>
            Open your console
          </Link>
        </Button>
      </div>
    </div>
  );
}
