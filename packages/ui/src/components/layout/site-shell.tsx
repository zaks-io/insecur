import type { ComponentProps, ReactNode } from "react";
import { cn } from "#lib/utils";

/**
 * Brutalist page frame for the Public Site: full-bleed, hard hairline rules, no centered column.
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
      <main className="flex-1">{children}</main>
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
    <header data-slot="site-header" className={cn("border-b-2 border-ink", className)} {...props}>
      <div className="flex items-stretch justify-between">
        <div className="flex items-center px-5 py-4 sm:px-8">{brand}</div>
        {nav ? (
          <nav className="flex items-center border-l-2 border-ink px-5 py-4 sm:px-8">{nav}</nav>
        ) : null}
      </div>
    </header>
  );
}

export function SiteFooter({ className, children, ...props }: ComponentProps<"footer">) {
  return (
    <footer data-slot="site-footer" className={cn("border-t-2 border-ink", className)} {...props}>
      <div className="px-5 py-6 sm:px-8">{children}</div>
    </footer>
  );
}
