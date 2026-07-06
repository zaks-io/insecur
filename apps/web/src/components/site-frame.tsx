import { SiteHeader, SiteShell, Wordmark } from "@insecur/ui";
import type { ReactNode } from "react";

/**
 * Frame for the console's pre-auth and proof pages (landing, login, whoami): the Public Site's
 * editorial header over the page content. Authed console pages use the ConsoleFrame instead.
 */
export function SiteFrame({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <SiteShell
      header={
        <SiteHeader
          brand={
            <a href="/" className="inline-flex items-center text-foreground no-underline">
              <Wordmark />
            </a>
          }
          {...(nav !== undefined ? { nav } : {})}
        />
      }
    >
      {children}
    </SiteShell>
  );
}
