import { createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import type { ReactNode } from "react";
import {
  Button,
  SiteFooter,
  SiteHeader,
  SiteNavLink,
  SiteShell,
  THEME_INIT_SCRIPT,
  ThemeToggle,
  useThemeClass,
  Wordmark,
} from "@insecur/ui";
import { sentryBrowserConfigScript } from "@insecur/observability";
import geistVariableUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import geistMonoVariableUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url";
import { consoleOrigin } from "../console-url.js";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "insecur | Run your app without plaintext .env files" },
      {
        name: "description",
        content:
          "An experimental developer tool for encrypted development secrets and runtime injection without plaintext .env files.",
      },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0a0a0a" },
      // Placeholder site: keep it out of search indexes until launch.
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      {
        rel: "preload",
        href: geistVariableUrl,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: geistMonoVariableUrl,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
});

// An HTML comment near the top of every page for agents that curl the site: invisible to humans,
// it points machine readers at the markdown docs surface. JSX cannot emit comments, so a hidden
// wrapper injects it (static string, trusted by construction).
const AGENT_HINT_COMMENT = [
  "<!--",
  "Reading this as an agent? Machine-readable docs index: https://insecur.cloud/llms.txt",
  "Full docs corpus in one file: https://insecur.cloud/llms-full.txt",
  "Agent quickstart: https://insecur.cloud/docs/agent-quickstart.md",
  "Every /docs page is also raw markdown at the same URL with a .md suffix.",
  "-->",
].join("\n");

function AgentHint() {
  return <div hidden dangerouslySetInnerHTML={{ __html: AGENT_HINT_COMMENT }} />;
}

function RootDocument({ children }: { children: ReactNode }) {
  const context = readStartContext();
  const sentryScript = sentryBrowserConfigScript(context?.sentry);
  const themeClass = useThemeClass();

  return (
    <html lang="en" className={themeClass} suppressHydrationWarning>
      <head>
        {/* Stamp .dark before first paint so SSR'd pages never flash the wrong scheme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AgentHint />
        <SiteShell header={<SiteChrome />} footer={<SiteFooterContent />}>
          {children}
        </SiteShell>
        {sentryScript ? <script dangerouslySetInnerHTML={{ __html: sentryScript }} /> : null}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Request host, identical on the server (start context) and in the browser (location), so the
 * environment-scoped console links hydrate without a mismatch.
 */
function useRequestHost(): string | undefined {
  const host = readStartContext()?.host;
  if (host !== undefined) {
    return host;
  }
  return typeof window !== "undefined" ? window.location.host : undefined;
}

function SiteChrome() {
  const { pathname } = useLocation();
  const consoleUrl = consoleOrigin(useRequestHost());
  return (
    <SiteHeader
      brand={
        <a href="/" className="inline-flex items-center text-foreground no-underline">
          <Wordmark />
        </a>
      }
      nav={
        <>
          <SiteNavLink href="/docs" active={pathname.startsWith("/docs")}>
            Docs
          </SiteNavLink>
          <SiteNavLink href="/security" active={pathname.startsWith("/security")}>
            Security
          </SiteNavLink>
        </>
      }
      actions={
        <>
          <ThemeToggle />
          <Button asChild size="sm">
            <a href={consoleUrl}>Sign in</a>
          </Button>
        </>
      }
    />
  );
}

const footerGroups = (consoleUrl: string) =>
  [
    {
      heading: "Product",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "Security", href: "/security" },
        { label: "Console", href: consoleUrl },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    },
    {
      heading: "Agents",
      links: [
        { label: "llms.txt", href: "/llms.txt" },
        { label: "Agent quickstart", href: "/docs/agent-quickstart" },
      ],
    },
  ] as const;

function SiteFooterContent() {
  const consoleUrl = consoleOrigin(useRequestHost());
  return (
    <SiteFooter>
      <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Wordmark />
          <p className="text-sm text-muted-foreground">
            Run your app without plaintext .env files.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-16">
          {footerGroups(consoleUrl).map((group) => (
            <div key={group.heading} className="flex flex-col gap-3">
              <p className="text-sm font-medium">{group.heading}</p>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        insecur.cloud. An experimental, open-source developer tool. There is no public sign-up yet;
        sign-in is for accounts that are already enabled.
      </p>
    </SiteFooter>
  );
}

function readStartContext(): ReturnType<typeof getGlobalStartContext> | undefined {
  try {
    return getGlobalStartContext();
  } catch {
    return undefined;
  }
}
