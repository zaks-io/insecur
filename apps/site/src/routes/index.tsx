import { createFileRoute } from "@tanstack/react-router";
import { Button, cn } from "@insecur/ui";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

// The story is the workflow before runtime injection: the agent never types, picks, stores, or
// pastes the raw secret. No claim about runtime containment.
const CUSTODY = [
  {
    gone: "copy-paste",
    head: "The agent never picks the secret.",
    body: "It asks insecur for one. We generate a random value and set it — nobody typed it, nobody has it in a chat log, and there's no string sitting around to paste into a file or a commit.",
  },
  {
    gone: "dead keys",
    head: "It gets back a key that works.",
    body: "The agent doesn't get a random string to go debug. It gets a handle it can use right away, so it spins up what it needs and moves on instead of chasing a bad credential.",
  },
  {
    gone: "mystery",
    head: "Every use is on the record.",
    body: "Which identity asked for which secret, when, from where. Deterministic and trackable, so a leak is a question you can answer instead of guess at.",
  },
] as const;

function LandingPage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <Custody />
      <Closer />
    </div>
  );
}

/** Recurring section marker: the wordmark's red point, then a mono label. */
function Eyebrow({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground uppercase">
      <span aria-hidden className="size-1.5 bg-signal" />
      {children}
    </p>
  );
}

function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
        <div className="hero-rise">
          <Eyebrow>Secrets custody for coding agents</Eyebrow>
          <h1 className="mt-6 max-w-5xl text-6xl leading-none font-semibold tracking-tighter text-balance sm:text-7xl lg:text-9xl">
            You are insecur<span className="text-signal">e</span> right&nbsp;now.
          </h1>
          <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
            Your <span className="font-medium text-foreground">.env</span> sits in plaintext next to
            a coding agent that already read it. insecur is no-reveal secrets custody: your agent
            asks for what it needs, insecur creates and sets it, and hands back a key that just
            works.{" "}
            <span className="font-medium text-foreground">
              The agent never types, picks, or copies the raw secret.
            </span>
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="/docs">Read the docs</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="/security">How it's secured</a>
            </Button>
          </div>
        </div>
        <Terminal />
      </div>
    </section>
  );
}

const TERMINAL_LINES = [
  { tag: "agent", text: <>needs DATABASE_URL for env dev</> },
  {
    tag: "insecur",
    text: (
      <>
        created postgres credential <Redacted /> value never shown
      </>
    ),
  },
  { tag: "insecur", text: <>bound runtime injection · dev · single use</> },
  {
    tag: "agent",
    text: <span className="font-medium">deploy succeeded · connection healthy</span>,
  },
  {
    tag: "audit",
    text: (
      <span className="text-muted-foreground">
        agent session · create + bind DATABASE_URL · on the record
      </span>
    ),
  },
] as const;

/** The signature mark: the secret, drawn the only way this product will ever show it. */
function Redacted() {
  return (
    <span
      aria-label="redacted"
      className="mx-1 inline-block h-[0.8em] w-24 translate-y-[0.08em] bg-foreground/75"
    />
  );
}

function Terminal() {
  return (
    <div className="mt-16 sm:mt-20 lg:ml-auto lg:max-w-3xl">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs text-muted-foreground">~/app · agent session</span>
          <span className="font-mono text-xs tracking-widest text-signal uppercase">
            no secrets in transcript
          </span>
        </div>
        <div className="flex flex-col gap-2 overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed">
          <p className="terminal-line">
            <span className="text-muted-foreground select-none">$ </span>
            <span>claude "wire the app up to postgres"</span>
          </p>
          {TERMINAL_LINES.map((line, i) => (
            <p key={i} className="terminal-line">
              <span
                className={cn(
                  "mr-3 inline-block w-14 select-none",
                  line.tag === "insecur" ? "text-signal" : "text-muted-foreground",
                )}
              >
                {line.tag}
              </span>
              {line.text}
            </p>
          ))}
          <p aria-hidden className="terminal-line">
            <span className="terminal-caret inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-foreground/80" />
          </p>
        </div>
      </div>
    </div>
  );
}

function Custody() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Eyebrow>What you get</Eyebrow>
        <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tighter sm:text-5xl">
          Secrets, built for agents.
        </h2>
        <div className="mt-12 grid gap-y-12 md:grid-cols-3 md:gap-y-0 md:divide-x md:divide-border">
          {CUSTODY.map((item, i) => (
            <div
              key={item.gone}
              className={cn("flex flex-col gap-4", i > 0 && "md:pl-8", i < 2 && "md:pr-8")}
            >
              <p className="text-3xl leading-none font-semibold tracking-tight">
                No{" "}
                <span className="relative inline-block">
                  {item.gone}
                  <span
                    aria-hidden
                    className="absolute inset-x-[-0.06em] top-1/2 h-[0.09em] -translate-y-1/2 bg-signal"
                  />
                </span>
              </p>
              <h3 className="text-base leading-snug font-medium">{item.head}</h3>
              <p className="max-w-[44ch] text-sm leading-relaxed text-pretty text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closer() {
  return (
    <section>
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Eyebrow>The whole point</Eyebrow>
        <h2 className="mt-6 max-w-4xl text-4xl leading-none font-semibold tracking-tighter text-balance sm:text-6xl lg:text-7xl">
          Let your agents ship. Skip the part where they hold the secret.
        </h2>
        <div className="mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[46ch] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            We're building it now, on Cloudflare Workers and GitHub Actions. No sign-up yet, and no
            production secrets are being held. Check back soon.
          </p>
          <Button asChild size="lg" className="shrink-0">
            <a href="/docs">Read the docs</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
