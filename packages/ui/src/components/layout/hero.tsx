import type { ComponentProps, ReactNode } from "react";
import { cn } from "#lib/utils";

/**
 * Landing hero: eyebrow, headline, lede, and an action slot. Copy is supplied by the caller; this
 * primitive owns layout and type scale only (ADR-0078 content-free UI boundary).
 */
export function Hero({
  eyebrow,
  title,
  lede,
  actions,
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section data-slot="hero" className={cn("max-w-2xl", className)} {...props}>
      {eyebrow ? (
        <p className="mb-4 text-sm font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
      ) : null}
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
      {lede ? (
        <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">{lede}</p>
      ) : null}
      {actions ? <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div> : null}
    </section>
  );
}
