import type { ComponentProps, ReactNode } from "react";
import { cn } from "#lib/utils";

/**
 * Reserved plot for a console section whose slice has not landed: a hatched band, like an
 * architect's reserved area, over a plain statement of what will live there. Presentational only
 * (ADR-0078); title and description are passed in by the caller.
 */
export function ConsolePlaceholder({
  title,
  className,
  children,
  ...props
}: ComponentProps<"section"> & { title: ReactNode }) {
  return (
    <section
      data-slot="console-placeholder"
      className={cn("border-2 border-ink", className)}
      {...props}
    >
      <div
        aria-hidden
        className="h-20 border-b-2 border-ink bg-[repeating-linear-gradient(-45deg,transparent,transparent_9px,color-mix(in_oklab,var(--ink)_12%,transparent)_9px,color-mix(in_oklab,var(--ink)_12%,transparent)_10px)]"
      />
      <div className="flex flex-col gap-2 px-6 py-6">
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
        <div className="max-w-prose text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}
