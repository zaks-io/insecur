import { Button } from "@insecur/ui";
import { sentryBrowserConfigScript } from "@insecur/observability";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { SiteFrame } from "../components/site-frame.js";
// The design system is the only stylesheet: no app-local CSS (docs/web-console-ux.md §Visual
// Direction adoption pass). Utility generation for this app's own sources comes from Tailwind's
// automatic source detection rooted at the app.
import appCss from "@insecur/ui/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "insecur console" },
      { name: "description", content: "insecur tenant web console" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: RootNotFound,
});

/**
 * Global fallback for unmatched paths outside any org shell: rendered inside SiteFrame so the
 * editorial header frames the 404 instead of a bare document. Org-scoped 404s keep their own
 * in-shell notFoundComponent (docs/web-console-ux.md §URLs).
 */
function RootNotFound() {
  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <div className="max-w-xl border-2 border-ink px-6 py-6">
          <p className="font-mono text-xs text-muted-foreground">404</p>
          <h1 className="mt-1 font-display text-2xl leading-tight">Not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This page doesn't exist.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-5">
            <a href="/">Go home</a>
          </Button>
        </div>
      </section>
    </SiteFrame>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const context = readStartContext();
  const sentryScript = sentryBrowserConfigScript(context?.sentry);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {sentryScript ? (
          <script nonce={context?.nonce} dangerouslySetInnerHTML={{ __html: sentryScript }} />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

function readStartContext(): ReturnType<typeof getGlobalStartContext> | undefined {
  try {
    return getGlobalStartContext();
  } catch {
    return undefined;
  }
}
