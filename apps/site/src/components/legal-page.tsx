import type { ReactNode } from "react";

/**
 * Shared frame for the two long-form legal pages (privacy, terms). The visual language is the same
 * ink-on-paper brutalism as the rest of the Public Site: a hairline-ruled masthead, a mono metadata
 * row that reads like the product's own secret metadata (key · env · version), and numbered clauses.
 * Numbering is real structure here, not decoration: a legal document is a sequence you cite by
 * section, so the two-digit index in the gutter earns its place. The site's root SiteShell supplies
 * the header and footer, so this renders bare article content.
 */

export interface LegalClause {
  heading: string;
  body: ReactNode;
}

export function LegalPage({
  eyebrow,
  title,
  summary,
  updated,
  version,
  banner,
  clauses,
  contactEmail = "legal@insecur.cloud",
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  version: string;
  banner?: ReactNode;
  clauses: LegalClause[];
  contactEmail?: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Masthead
        eyebrow={eyebrow}
        title={title}
        summary={summary}
        updated={updated}
        version={version}
      />
      {banner ? <div className="mt-8">{banner}</div> : null}
      <div className="mt-4">
        {clauses.map((clause, index) => (
          <Clause key={clause.heading} index={index} clause={clause} />
        ))}
      </div>
      <ContactLine email={contactEmail} />
    </article>
  );
}

function Masthead({
  eyebrow,
  title,
  summary,
  updated,
  version,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  version: string;
}) {
  return (
    <header className="border-b-2 border-ink pb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl leading-[0.95] sm:text-6xl">{title}</h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{summary}</p>
      <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
        <div className="flex gap-2">
          <dt className="uppercase tracking-wide">Updated</dt>
          <dd className="text-foreground">{updated}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="uppercase tracking-wide">Version</dt>
          <dd className="text-foreground">{version}</dd>
        </div>
      </dl>
    </header>
  );
}

function Clause({ index, clause }: { index: number; clause: LegalClause }) {
  return (
    <NumberedRow index={index} className="py-8">
      <h2 className="font-display text-xl leading-tight sm:text-2xl">{clause.heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {clause.body}
      </div>
    </NumberedRow>
  );
}

/**
 * A hairline-ruled row led by a two-digit display index in a fixed gutter. Shared by the legal
 * clauses and the security page's structural controls so the index formatting and the decorative
 * gutter's `aria-hidden` live in one place.
 */
export function NumberedRow({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-ink/25 last:border-b-0 sm:grid-cols-[3.5rem_1fr] sm:gap-x-6 ${className ?? ""}`}
    >
      <p aria-hidden="true" className="font-display text-2xl leading-none text-ink/35 sm:text-3xl">
        {String(index + 1).padStart(2, "0")}
      </p>
      <div>{children}</div>
    </section>
  );
}

function ContactLine({ email }: { email: string }) {
  return (
    <footer className="mt-10 border-t-2 border-ink pt-6 font-mono text-xs text-muted-foreground">
      <p>
        Questions about this page:{" "}
        <a
          href={`mailto:${email}`}
          className="font-semibold text-foreground underline underline-offset-4"
        >
          {email}
        </a>
      </p>
    </footer>
  );
}

/**
 * The pre-alpha status stamp: the signature element. A bordered notice in the product's own deadpan
 * register, using the single signal-red accent on the words that carry the warning. This is the one
 * loud thing on the page; everything else stays quiet.
 */
export function StatusStamp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="border-2 border-signal">
      <p className="border-b-2 border-signal bg-signal px-4 py-2 font-mono text-xs uppercase tracking-widest text-paper">
        {label}
      </p>
      <div className="flex flex-col gap-3 px-4 py-4 text-sm leading-relaxed text-foreground sm:px-5">
        {children}
      </div>
    </aside>
  );
}
