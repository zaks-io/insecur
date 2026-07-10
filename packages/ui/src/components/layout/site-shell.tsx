import type { ComponentProps, ReactNode } from "react";
import { Slot } from "radix-ui";
import { cn } from "#lib/utils";

/**
 * Page frame for the public surfaces (marketing site, docs, legal, and the console's pre-auth
 * pages): a sticky translucent header over a centered content column. Presentational only. All
 * text is passed in by the caller (ADR-0078 content-free UI boundary).
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

/**
 * Sticky site header: brand on the left, nav links beside it, actions (theme toggle, auth CTA)
 * on the right. Shared verbatim by the site and the web console so the cross-domain hop between
 * the two reads as one product.
 */
export function SiteHeader({
  brand,
  nav,
  actions,
  className,
  ...props
}: ComponentProps<"header"> & { brand: ReactNode; nav?: ReactNode; actions?: ReactNode }) {
  return (
    <header
      data-slot="site-header"
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md",
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <div className="flex shrink-0 items-center">{brand}</div>
        {nav ? (
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{nav}</nav>
        ) : (
          <div className="flex-1" aria-hidden />
        )}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** One header nav link. Pass `asChild` to render a router link. */
export function SiteNavLink({
  active = false,
  asChild = false,
  className,
  ...props
}: ComponentProps<"a"> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="site-nav-link"
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap no-underline transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SiteFooter({ className, children, ...props }: ComponentProps<"footer">) {
  return (
    <footer data-slot="site-footer" className={cn("border-t border-border", className)} {...props}>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">{children}</div>
    </footer>
  );
}
