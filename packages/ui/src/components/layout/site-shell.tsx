import type { ComponentProps, ReactNode } from "react";
import { cn } from "#lib/utils";

/**
 * Branded page frame for the Public Site: a header slot, the main content column, and a footer slot.
 * Presentational only. All text is passed in by the caller (ADR-0078 content-free UI boundary).
 */
export function SiteShell({
  header,
  footer,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { header?: ReactNode; footer?: ReactNode }) {
  return (
    <div
      data-slot="site-shell"
      className={cn("flex min-h-dvh flex-col bg-background text-foreground", className)}
      {...props}
    >
      {header}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">{children}</main>
      {footer}
    </div>
  );
}

export function SiteHeader({
  brand,
  nav,
  className,
  ...props
}: ComponentProps<"header"> & { brand: ReactNode; nav?: ReactNode }) {
  return (
    <header
      data-slot="site-header"
      className={cn("border-b border-border/80", className)}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">{brand}</span>
        {nav ? <nav className="flex items-center gap-5 text-sm">{nav}</nav> : null}
      </div>
    </header>
  );
}

export function SiteFooter({ className, children, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      data-slot="site-footer"
      className={cn("border-t border-border/80", className)}
      {...props}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-muted-foreground">
        {children}
      </div>
    </footer>
  );
}
