import type { ReactNode } from "react";

/** The editorial panel every wizard step lives in: ink border, display heading, quiet intro. */
export function StepPanel({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-6">
      <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{intro}</p>
      {children}
    </div>
  );
}
