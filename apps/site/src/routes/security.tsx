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
    tier: "Production",
    claim: "No read-back path",
    body: "For Protected Environment values, nobody gets a plaintext read-back path through the product: not the agent, not CI, not you, not our support staff. The readable value never reaches a machine an ordinary session controls.",
  },
  {
    tier: "Development",
    claim: "Small blast radius",
    body: "The dev secret is injected into the process your agent controls, so that agent can read it. We do not claim otherwise. The protection is a small, recoverable blast radius: no plaintext at rest, one short-lived single-use grant per run, trivial rotation.",
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
    body: "Which identity asked for which secret, when, from where. The audit trail is the point of the product, not a bolt-on, so a leak is a question you can answer instead of guess at.",
  },
];

export function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
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
    <header className="border-b-2 border-ink pb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Security posture
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[0.95] sm:text-6xl">
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
      <div className="mt-5 grid gap-px border border-ink/25 bg-ink/25 sm:grid-cols-2">
        {BOUNDARIES.map((b) => (
          <div key={b.tier} className="flex flex-col gap-3 bg-paper px-5 py-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-2xl leading-none">{b.tier}</span>
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
        Why it holds: structure, not vigilance
      </h2>
      <div className="mt-5 flex flex-col">
        {CONTROLS.map((c, i) => (
          <NumberedRow key={c.head} index={i} className="py-6">
            <h3 className="font-display text-lg leading-tight sm:text-xl">{c.head}</h3>
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
    <section className="mt-12 border-2 border-ink px-5 py-6 sm:px-6">
      <h2 className="font-display text-xl leading-tight sm:text-2xl">Check it yourself</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        The design is meant to be verified, not taken on faith. As they become public, this page
        will link the source code and the threat-model white paper that spells out the adversaries
        we model, the trust boundaries, and where the no-reveal claim starts and stops. Until then,
        the claim ceiling above is the honest version: structural unreadability for production,
        small blast radius for dev, and no zero-knowledge promise anywhere.
      </p>
    </section>
  );
}

function PostureContact() {
  return (
    <footer className="mt-10 border-t-2 border-ink pt-6 font-mono text-xs text-muted-foreground">
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
