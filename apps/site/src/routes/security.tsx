import { createFileRoute } from "@tanstack/react-router";
import { NumberedRow } from "../components/legal-page.js";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

interface Boundary {
  tier: string;
  claim: string;
  body: string;
}

// The honest-claim vocabulary: no-reveal for production, a weaker recoverable boundary for dev, and
// never zero-knowledge. Grounded in docs/whitepaper/threat-model.md §2.4/§2.5.
const BOUNDARIES: Boundary[] = [
  {
    tier: "Production design",
    claim: "Not launch-proven",
    body: "The protected-environment design has no plaintext read-back path through the product. Production delivery and security verification remain incomplete. Do not use the service for valuable production secrets.",
  },
  {
    tier: "Development",
    claim: "Encrypted storage",
    body: "Development secrets are stored encrypted and injected into a child process. An agent controlling that process can read the values. Hosted injection uses short-lived single-use grants. Automatic credential rotation and one-button recovery are not available.",
  },
];

interface Control {
  head: string;
  body: string;
}

const CONTROLS: Control[] = [
  {
    head: "Capability isolation, not a monolith",
    body: "insecur runs as separate Cloudflare Worker deploys. Exactly one holds the root key and it serves zero public routes. No deploy holds both a public route and the key that decrypts.",
  },
  {
    head: "One place decrypts",
    body: "Ciphertext becomes plaintext in a single deploy with no public HTTP path, reached only over a private Service Binding carrying a short-lived scoped token. There is no public route to the thing that can decrypt.",
  },
  {
    head: "Tenant-bound keys",
    body: "Every secret is encrypted under a key bound to your tenant, so a leak in one organization cannot decrypt another. When something leaks, it leaks small.",
  },
  {
    head: "Every use on the record",
    body: "Which identity asked for which secret, when, from where. Hosted grants and use are audited. This records access through insecur, not every read or leak inside a process.",
  },
];

export function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <PostureHeader />
      <BoundarySection />
      <ControlsSection />
      <VerifySection />
      <PostureContact />
    </article>
  );
}

function PostureHeader() {
  return (
    <header className="border-b border-border pb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Security posture
      </p>
      <h1 className="mt-3 text-4xl leading-[1.02] font-semibold tracking-tighter sm:text-6xl">
        What we claim, and what we don&rsquo;t
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
        insecur is named after the problem, so we don&rsquo;t get to pretend it away. Here is the
        boundary in plain terms: what the design protects, where it stops, and how you can check it
        yourself.
      </p>
    </header>
  );
}

function BoundarySection() {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        The boundary
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {BOUNDARIES.map((b) => (
          <div
            key={b.tier}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-6"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xl leading-none font-semibold tracking-tight">{b.tier}</span>
              <span className="font-mono text-xs uppercase tracking-wide text-signal">
                {b.claim}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        What we never say: that insecur is zero-knowledge, that we cannot decrypt, or that the
        running process is technically incapable of reading its own environment. The running process
        gets the value it was given. Our claim is about the workflow before that, and about who can
        read a Protected Environment value back through the product.
      </p>
    </section>
  );
}

function ControlsSection() {
  return (
    <section className="mt-12">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Hosted architecture
      </h2>
      <div className="mt-5 flex flex-col">
        {CONTROLS.map((c, i) => (
          <NumberedRow key={c.head} index={i} className="py-6">
            <h3 className="text-lg leading-tight font-semibold tracking-tight sm:text-xl">
              {c.head}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {c.body}
            </p>
          </NumberedRow>
        ))}
      </div>
    </section>
  );
}

function VerifySection() {
  return (
    <section className="mt-12 rounded-xl border border-border bg-card px-5 py-6 sm:px-6">
      <h2 className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
        Check it yourself
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        insecur is experimental. Read the{" "}
        <a href="https://github.com/zaks-io/insecur" className="underline underline-offset-4">
          source code
        </a>
        , the{" "}
        <a href="/docs/security-model" className="underline underline-offset-4">
          security model
        </a>
        , and the{" "}
        <a
          href="https://github.com/zaks-io/insecur/blob/main/docs/project-status.md"
          className="underline underline-offset-4"
        >
          launch blockers
        </a>{" "}
        before evaluating it. Architecture describes the intended controls; it does not establish
        that the service is ready for production secrets.
      </p>
    </section>
  );
}

function PostureContact() {
  return (
    <footer className="mt-10 border-t border-border pt-6 font-mono text-xs text-muted-foreground">
      <p>
        Questions about our security posture:{" "}
        <a
          href="mailto:security@insecur.cloud"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          security@insecur.cloud
        </a>
      </p>
    </footer>
  );
}
