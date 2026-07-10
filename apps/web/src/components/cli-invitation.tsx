/**
 * Empty-state panel for a console list that has nothing to show yet: an empty screen is an
 * invitation to act (docs/web-console-ux.md), so it hands the member the exact CLI command
 * instead of a blank panel. Metadata only; commands never carry Sensitive Values.
 */
export function CliInvitation({
  title,
  lead,
  command,
  hint,
}: {
  title: string;
  lead: string;
  command: string;
  hint: string;
}) {
  return (
    <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card px-6 py-6">
      <h2 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{lead}</p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm">
        <code>{command}</code>
      </pre>
      <p className="mt-3 max-w-prose text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}
