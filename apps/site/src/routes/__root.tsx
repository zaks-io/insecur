import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SiteShell } from "@insecur/ui";
import appCss from "@insecur/ui/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "insecur — no-reveal secrets custody" },
      {
        name: "description",
        content: "No-reveal secrets custody for teams shipping with agents and CI.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <SiteShell
          header={
            <SiteHeader
              brand="insecur"
              nav={
                <a className="text-muted-foreground hover:text-foreground" href="/">
                  Home
                </a>
              }
            />
          }
          footer={<SiteFooter>© insecur — no-reveal secrets custody.</SiteFooter>}
        >
          {children}
        </SiteShell>
        <Scripts />
      </body>
    </html>
  );
}
