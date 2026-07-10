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
      className={cn("overflow-hidden rounded-xl border border-dashed border-border", className)}
      {...props}
    >
      <div
        aria-hidden
        className="h-16 border-b border-dashed border-border bg-[repeating-linear-gradient(-45deg,transparent,transparent_9px,color-mix(in_oklab,var(--foreground)_8%,transparent)_9px,color-mix(in_oklab,var(--foreground)_8%,transparent)_10px)]"
      />
      <div className="flex flex-col gap-2 px-6 py-6">
        <h2 className="text-lg leading-tight font-semibold tracking-tight">{title}</h2>
        <div className="max-w-prose text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}
