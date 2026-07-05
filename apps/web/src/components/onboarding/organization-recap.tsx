/** The chosen organization name, carried into later steps with one way back to change it. */
export function OrganizationRecap({
  organizationName,
  onEdit,
}: {
  organizationName: string;
  onEdit: () => void;
}) {
  return (
    <div className="mt-5 flex items-baseline gap-4 border-y border-ink/20 py-3">
      <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
        Organization
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{organizationName}</span>
      <button
        type="button"
        onClick={onEdit}
        className="text-sm underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Change
      </button>
    </div>
  );
}
