import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsPage } from "../components/docs-page.js";
import { getDocPage, type DocPage as DocPageModel } from "../docs/manifest.js";

/**
 * Rendered HTML for every non-index docs page, e.g. /docs/quickstart and /docs/cli/login. The raw
 * markdown twin (/docs/<slug>.md) is served by the static pathname guard in static-site-routes.ts
 * before routing reaches TanStack.
 */
export const Route = createFileRoute("/docs/$")({
  loader: ({ params }): { page: DocPageModel } => {
    // "index" resolves too: llms.txt lists /docs/index.md, and the blanket rule "drop the .md
    // suffix for HTML" must hold for every listed URL. Canonical home stays /docs.
    const page = getDocPage(params._splat ?? "");
    if (!page) {
      throw notFound();
    }
    return { page };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.page.title} — insecur docs` },
          { name: "description", content: loaderData.page.description },
        ]
      : [],
  }),
  component: DocsSlugPage,
});

function DocsSlugPage() {
  const { page } = Route.useLoaderData();
  return <DocsPage page={page} />;
}
