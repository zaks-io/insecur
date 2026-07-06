import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cn } from "#lib/utils";

/**
 * In-page breadcrumb trail. URLs carry opaque IDs only; the trail carries Display Names
 * (docs/web-console-ux.md §URLs). Presentational only (ADR-0078).
 */
export function Breadcrumbs({ className, children, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-slot="breadcrumbs"
      className={cn("text-sm", className)}
      {...props}
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</ol>
    </nav>
  );
}

/**
 * One breadcrumb. `current` marks the page being viewed; `asChild` renders a router link for the
 * ancestors. Separators are drawn by the item itself so callers only list crumbs.
 */
export function BreadcrumbItem({
  current = false,
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<"li"> & { current?: boolean; asChild?: boolean }) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn(
        "flex items-center gap-x-2 before:text-muted-foreground/50 before:content-['/'] first:before:content-none",
        className,
      )}
      {...props}
    >
      {current ? (
        <span aria-current="page" className="font-medium text-foreground">
          {children}
        </span>
      ) : asChild ? (
        <Slot.Root className="text-muted-foreground no-underline underline-offset-4 hover:text-foreground hover:underline">
          {children}
        </Slot.Root>
      ) : (
        <span className="text-muted-foreground">{children}</span>
      )}
    </li>
  );
}
