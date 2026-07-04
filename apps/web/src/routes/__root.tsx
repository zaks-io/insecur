import { sentryBrowserConfigScript } from "@insecur/observability";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "insecur tenant web console" },
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
        <header className="site-header">
          <a href="/">insecur</a>
          <nav>
            <a href="/whoami">Whoami proof</a>
          </nav>
        </header>
        <main>{children}</main>
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
