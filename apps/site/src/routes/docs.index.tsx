import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "../components/docs-page.js";
import { getDocPage } from "../docs/manifest.js";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      { title: `${docsIndexPage().title} — insecur docs` },
      { name: "description", content: docsIndexPage().description },
    ],
  }),
  component: DocsIndexPage,
});

function docsIndexPage() {
  const page = getDocPage("index");
  if (!page) {
    throw new Error("docs manifest is missing the index page");
  }
  return page;
}

export function DocsIndexPage() {
  return <DocsPage page={docsIndexPage()} />;
}
