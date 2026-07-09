import type { DocPage } from "../docs/manifest.js";
import { DOC_SECTIONS } from "../docs/manifest.js";
import { renderDocHtml } from "../docs/render.js";

/**
 * Shared frame for the documentation pages: a section-grouped sidebar built from the docs
 * manifest, the rendered markdown article, and a per-page "View as Markdown" link to the raw .md
 * twin so readers (human or agent) can switch formats from any page. Same ink-on-paper language as
 * the rest of the Public Site; the root SiteShell supplies header and footer.
 */
export function DocsPage({ page }: { page: DocPage }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:flex-row">
      <DocsSidebar activeSlug={page.slug} />
      <article className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink/20 pb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            {page.section}
          </p>
          <a
            href={page.markdownHref}
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            View as Markdown
          </a>
        </div>
        <div
          className="docs-prose mt-8"
          dangerouslySetInnerHTML={{ __html: renderDocHtml(page.slug, page.body) }}
        />
      </article>
    </div>
  );
}

function DocsSidebar({ activeSlug }: { activeSlug: string }) {
  return (
    <nav aria-label="Documentation" className="w-full shrink-0 lg:w-56">
      <div className="flex flex-col gap-6">
        {DOC_SECTIONS.map((group) => (
          <div key={group.section}>
            <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {group.section}
            </p>
            <ul className="mt-2 flex flex-col gap-1 border-l border-ink/15">
              {group.pages.map((entry) => (
                <li key={entry.slug}>
                  <a
                    href={entry.href}
                    aria-current={entry.slug === activeSlug ? "page" : undefined}
                    className={
                      entry.slug === activeSlug
                        ? "-ml-px block border-l-2 border-ink py-0.5 pl-3 text-sm font-semibold text-foreground"
                        : "block py-0.5 pl-3 text-sm text-muted-foreground hover:text-foreground"
                    }
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
