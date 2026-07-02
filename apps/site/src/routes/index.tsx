import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@insecur/ui";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

// The story is the workflow before runtime injection: the agent never types, picks, stores, or
// pastes the raw secret. No claim about runtime containment.
const CUSTODY = [
  {
    gone: "No",
    goneWord: "copy-paste",
    head: "The agent never picks the secret.",
    body: "It asks insecur for one. We generate a random value and set it — nobody typed it, nobody has it in a chat log, and there's no string sitting around to paste into a file or a commit.",
  },
  {
    gone: "No",
    goneWord: "dead keys",
    head: "It gets back a key that works.",
    body: "The agent doesn't get a random string to go debug. It gets a handle it can use right away, so it spins up what it needs and moves on instead of chasing a bad credential.",
  },
  {
    gone: "No",
    goneWord: "mystery",
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

function Hero() {
  return (
    <section className="border-b-2 border-ink">
      <div className="grid items-end gap-y-8 px-5 pt-10 pb-8 sm:px-8 sm:pt-14 sm:pb-10 lg:grid-cols-[1.5fr_1fr] lg:gap-x-10">
        <div>
          <p className="mb-6 text-sm font-semibold tracking-[0.18em] uppercase">
            Secrets for teams shipping with agents
          </p>
          <h1 className="font-display text-6xl leading-[0.84] text-balance sm:text-8xl lg:text-9xl xl:text-[8.75rem]">
            You are <span className="text-signal">insecure</span> right now.
          </h1>
        </div>
        <p className="text-lg leading-snug text-pretty sm:text-xl lg:pb-2">
          Your <span className="font-semibold">.env</span> is sitting in plaintext next to a coding
          agent that already read it. So will the next five you run in parallel. You can&rsquo;t
          out-watch them.
        </p>
      </div>

      <div className="border-t-2 border-ink px-5 py-6 sm:px-8">
        <p className="max-w-4xl text-xl leading-snug text-pretty sm:text-2xl">
          So stop handing agents secrets to manage. Your agent asks insecur for what it needs,{" "}
          insecur creates and sets it, and hands back a key that just works.{" "}
          <span className="font-semibold">
            The agent never types, picks, or copies the raw secret.
          </span>
        </p>
      </div>
    </section>
  );
}

function Custody() {
  return (
    <section className="border-b-2 border-ink">
      <div className="flex items-baseline justify-between border-b-2 border-ink px-5 py-4 sm:px-8">
        <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">What you get</h2>
        <span className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
          Secrets, built for agents
        </span>
      </div>
      <div className="grid md:grid-cols-3">
        {CUSTODY.map((item, i) => (
          <div
            key={item.goneWord}
            className={cn(
              "flex flex-col gap-6 px-5 py-10 sm:px-8",
              i < CUSTODY.length - 1 && "border-b-2 border-ink md:border-r-2 md:border-b-0",
            )}
          >
            <span className="font-display text-4xl leading-[0.9] sm:text-5xl">
              {item.gone}{" "}
              <span className="relative inline-block">
                {item.goneWord}
                <span
                  aria-hidden
                  className="absolute inset-x-[-0.05em] top-1/2 h-[0.09em] -translate-y-1/2 bg-signal"
                />
              </span>
            </span>
            <div className="flex flex-col gap-3">
              <h3 className="text-xl leading-tight font-semibold">{item.head}</h3>
              <p className="text-base leading-relaxed text-pretty text-muted-foreground">
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Closer() {
  return (
    <section className="grid md:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col justify-end border-b-2 border-ink px-5 py-14 sm:px-8 sm:py-16 md:min-h-[22rem] md:border-r-2 md:border-b-0">
        <p className="text-sm font-semibold tracking-[0.18em] text-signal uppercase">
          The whole point
        </p>
        <p className="mt-6 font-display text-5xl leading-[0.92] text-balance sm:text-7xl">
          Let your agents ship. Skip the part where they hold the secret.
        </p>
      </div>
      <div className="flex flex-col justify-between gap-12 px-5 py-14 sm:px-8 sm:py-16">
        <p className="text-xl leading-relaxed text-pretty">
          We&rsquo;re building it now, on Cloudflare Workers and GitHub Actions. No sign-up yet, and
          no production secrets are being held. Check back soon.
        </p>
        <p className="text-sm tracking-[0.14em] text-muted-foreground uppercase">insecur.cloud</p>
      </div>
    </section>
  );
}
