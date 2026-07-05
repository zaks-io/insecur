import type { WorkspaceReceiptRow } from "../../onboarding/cli-handoff.js";

/** What exists now, by Display Name and opaque ID: the wizard's proof of work. */
export function MetadataReceipt({ rows }: { rows: readonly WorkspaceReceiptRow[] }) {
  return (
    <section aria-label="Metadata receipt" className="border-b-2 border-ink px-6 py-5">
      <h3 className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
        Metadata receipt
      </h3>
      <dl className="mt-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 border-b border-ink/20 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <dt className="w-32 shrink-0 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              {row.label}
            </dt>
            <dd className="flex min-w-0 flex-col gap-0.5 sm:flex-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              {row.displayName === undefined ? null : (
                <span className="text-sm font-medium">{row.displayName}</span>
              )}
              <span className="font-mono text-xs break-all text-muted-foreground select-all">
                {row.id}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
