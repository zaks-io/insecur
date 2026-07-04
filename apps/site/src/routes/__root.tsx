import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SiteShell, Wordmark } from "@insecur/ui";
import { sentryBrowserConfigScript } from "@insecur/observability";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "insecur — coming soon" },
      {
        name: "description",
        content:
          "Secrets custody built for coding agents. Your agent asks for what it needs, insecur creates and sets it, and it never has to hold the raw secret. Coming soon.",
      },
      { name: "theme-color", content: "#f5f3ef" },
      // Placeholder site: keep it out of search indexes until launch.
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const context = readStartContext();
  const sentryScript = sentryBrowserConfigScript(context?.sentry);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SiteShell
          header={
            <SiteHeader
              brand={<Wordmark />}
              nav={
                <span className="text-xs font-semibold tracking-[0.2em] uppercase">
                  Coming soon
                </span>
              }
            />
          }
          footer={
            <SiteFooter>
              <div className="flex flex-col gap-1 text-xs tracking-wide uppercase sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold">Secrets your agents never have to hold.</span>
                <span className="text-muted-foreground">insecur.cloud</span>
              </div>
            </SiteFooter>
          }
        >
          {children}
        </SiteShell>
        {sentryScript ? <script dangerouslySetInnerHTML={{ __html: sentryScript }} /> : null}
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
