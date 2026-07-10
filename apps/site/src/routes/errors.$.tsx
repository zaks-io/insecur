import { createFileRoute, notFound } from "@tanstack/react-router";
import { getErrorCatalogEntry, type ErrorCatalogEntry } from "../docs/error-catalog.js";

/**
 * Landing page for one stable error code. The API returns these URLs as RFC 9457 `type` URIs
 * (https://insecur.dev/errors/<slug>), so this is the page an agent or a human hits when they
 * paste the type of a failure they just received.
 */
export const Route = createFileRoute("/errors/$")({
  loader: ({ params }): { entry: ErrorCatalogEntry } => {
    const entry = getErrorCatalogEntry(params._splat ?? "");
    if (!entry) {
      throw notFound();
    }
    return { entry };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.entry.code} — insecur error reference` },
          { name: "description", content: loaderData.entry.notes },
        ]
      : [],
  }),
  component: ErrorDetailPage,
});

function ErrorDetailPage() {
  const { entry } = Route.useLoaderData();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Error reference
      </p>
      <h1 className="mt-3 font-mono text-3xl font-semibold tracking-tight break-words">
        {entry.code}
      </h1>
      {entry.notes ? <p className="mt-4 max-w-prose">{entry.notes}</p> : null}
      <dl className="mt-8 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 border-t border-border pt-6 text-sm">
        <dt className="font-semibold">CLI exit code</dt>
        <dd className="font-mono">{entry.exitCode}</dd>
        <dt className="font-semibold">HTTP status</dt>
        <dd className="font-mono">{String(entry.httpStatus)}</dd>
        <dt className="font-semibold">Remediation</dt>
        <dd>
          {entry.remediationRequired
            ? "The --json error envelope includes machine-readable remediation for this code."
            : "No fixed remediation; see the error message and notes."}
        </dd>
        <dt className="font-semibold">Type URI</dt>
        <dd className="font-mono break-all">{entry.typeUri}</dd>
      </dl>
      <p className="mt-8 text-sm">
        <a href="/errors" className="underline underline-offset-4">
          All error codes
        </a>{" "}
        ·{" "}
        <a href="/docs/reference/exit-codes" className="underline underline-offset-4">
          Exit codes
        </a>{" "}
        ·{" "}
        <a href="/docs" className="underline underline-offset-4">
          Documentation
        </a>
      </p>
    </article>
  );
}
