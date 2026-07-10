import { createFileRoute } from "@tanstack/react-router";
import { ERROR_CATALOG } from "../docs/error-catalog.js";

export const Route = createFileRoute("/errors/")({
  head: () => ({
    meta: [
      { title: "Error reference — insecur" },
      {
        name: "description",
        content:
          "Every stable error code the insecur API and CLI return, with exit code and HTTP status.",
      },
    ],
  }),
  component: ErrorIndexPage,
});

export function ErrorIndexPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Error reference
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Stable error codes</h1>
      <p className="mt-4 max-w-prose">
        Every failure from the insecur API or CLI carries one of these codes. In HTTP responses the
        code also appears as an RFC 9457 type URI that resolves to its page here. The{" "}
        <a href="/docs/reference/errors" className="underline underline-offset-4">
          full table with notes
        </a>{" "}
        lives in the documentation.
      </p>
      <ul className="mt-8 columns-1 gap-8 border-t border-border pt-6 font-mono text-sm sm:columns-2">
        {ERROR_CATALOG.map((entry) => (
          <li key={entry.slug} className="py-0.5">
            <a href={`/errors/${entry.slug}`} className="underline-offset-4 hover:underline">
              {entry.code}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
