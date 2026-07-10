import { SiteHeader, SiteNavLink, SiteShell, ThemeToggle, Wordmark } from "@insecur/ui";
import type { ReactNode } from "react";
import { useSiteOrigin } from "./use-site-origin.js";

/**
 * Frame for the console's pre-auth and proof pages (landing, login, whoami): the same header as
 * the public site, so the insecur.cloud → app.insecur.cloud hop reads as one product. Authed
 * console pages use the ConsoleFrame instead.
 */
export function SiteFrame({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  const docsUrl = `${useSiteOrigin()}/docs`;
  return (
    <SiteShell
      header={
        <SiteHeader
          brand={
            <a href="/" className="inline-flex items-center text-foreground no-underline">
              <Wordmark />
            </a>
          }
          nav={<SiteNavLink href={docsUrl}>Docs</SiteNavLink>}
          actions={
            <>
              <ThemeToggle />
              {nav}
            </>
          }
        />
      }
    >
      {children}
    </SiteShell>
  );
}
