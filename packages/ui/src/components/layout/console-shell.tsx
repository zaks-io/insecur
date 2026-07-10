import type { ComponentProps, ReactNode } from "react";
import { Slot } from "radix-ui";
import { cn } from "#lib/utils";

/**
 * Console frame for the tenant web console: the same sticky header language as the public site
 * over a two-column shell, so the site → console hop reads as one product
 * (docs/web-console-ux.md §Visual Direction). Presentational only; all navigation content is
 * passed in by the caller (ADR-0078).
 */
export function ConsoleShell({
  topbar,
  sidebar,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { topbar: ReactNode; sidebar: ReactNode }) {
  return (
    <div
      data-slot="console-shell"
      className={cn("flex min-h-dvh flex-col bg-background text-foreground", className)}
      {...props}
    >
      <header
        data-slot="console-topbar"
        className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md"
      >
        {topbar}
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          data-slot="console-sidebar"
          className="border-b border-border md:w-56 md:shrink-0 md:border-r md:border-b-0"
        >
          {sidebar}
        </aside>
        <main data-slot="console-main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Topbar row: brand cell, console controls (org switcher) behind a slash, session actions right. */
export function ConsoleTopbar({
  brand,
  controls,
  actions,
  className,
  ...props
}: ComponentProps<"div"> & { brand: ReactNode; controls?: ReactNode; actions?: ReactNode }) {
  return (
    <div
      data-slot="console-topbar-row"
      className={cn("flex h-14 items-center gap-3 px-4 sm:px-6", className)}
      {...props}
    >
      <div className="flex shrink-0 items-center">{brand}</div>
      {controls ? (
        <>
          <span
            aria-hidden
            className="text-lg font-extralight text-muted-foreground/40 select-none"
          >
            /
          </span>
          <div className="flex min-w-0 items-center">{controls}</div>
        </>
      ) : null}
      <div className="flex-1" aria-hidden />
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Console section list. `vertical` (the sidebar default) is a column on desktop and a scrollable
 * strip on small screens; `horizontal` stays a row at every width, for in-page sub-navigation
 * rails like a project's view tabs.
 */
export function ConsoleNav({
  orientation = "vertical",
  className,
  children,
  ...props
}: ComponentProps<"nav"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <nav
      data-slot="console-nav"
      data-orientation={orientation}
      className={cn(className)}
      {...props}
    >
      <ul
        className={cn(
          "flex flex-row gap-1 overflow-x-auto p-2",
          orientation === "vertical" && "md:flex-col md:p-3",
        )}
      >
        {children}
      </ul>
    </nav>
  );
}

/**
 * One sidebar section. The active section sits on a quiet muted plate. Pass `asChild` to render a
 * router link.
 */
export function ConsoleNavItem({
  active = false,
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<"a"> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <li className="shrink-0">
      <Comp
        data-slot="console-nav-item"
        data-active={active || undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    </li>
  );
}
