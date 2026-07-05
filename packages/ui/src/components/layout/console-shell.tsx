import type { ComponentProps, ReactNode } from "react";
import { Slot } from "radix-ui";
import { cn } from "#lib/utils";

/**
 * Console frame for the tenant web console: a full-bleed two-column frame drawn with hard ink
 * rules, inheriting the Public Site's editorial brutalism (docs/web-console-ux.md §Visual
 * Direction). Presentational only; all navigation content is passed in by the caller (ADR-0078).
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
      <header data-slot="console-topbar" className="border-b-2 border-ink">
        {topbar}
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          data-slot="console-sidebar"
          className="border-b-2 border-ink md:w-52 md:shrink-0 md:border-b-0 md:border-r-2"
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

/** Topbar row: brand cell, console controls (org switcher), and right-aligned session actions. */
export function ConsoleTopbar({
  brand,
  controls,
  actions,
  className,
  ...props
}: ComponentProps<"div"> & { brand: ReactNode; controls?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-slot="console-topbar-row" className={cn("flex items-stretch", className)} {...props}>
      <div className="flex items-center border-r-2 border-ink px-5 py-3 sm:px-6">{brand}</div>
      {controls ? <div className="flex items-center px-4 py-2">{controls}</div> : null}
      <div className="flex-1" aria-hidden />
      {actions ? (
        <div className="flex items-center gap-3 border-l-2 border-ink px-4 py-2 sm:px-6">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Sidebar section list: a column on desktop, a scrollable strip on small screens. */
export function ConsoleNav({ className, children, ...props }: ComponentProps<"nav">) {
  return (
    <nav data-slot="console-nav" className={cn(className)} {...props}>
      <ul className="flex flex-row overflow-x-auto md:flex-col md:py-3">{children}</ul>
    </nav>
  );
}

/**
 * One sidebar section. The active section inverts to a solid ink block — the console's signature
 * move. Pass `asChild` to render a router link.
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
          "block px-5 py-3 text-xs font-semibold tracking-[0.18em] uppercase no-underline transition-colors md:px-6",
          active ? "bg-ink text-paper" : "text-foreground hover:bg-ink/10",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    </li>
  );
}
