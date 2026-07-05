import { sentryBrowserConfigScript } from "@insecur/observability";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import type { ReactNode } from "react";
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
