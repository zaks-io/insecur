import { createFileRoute } from "@tanstack/react-router";
import { Button, cn } from "@insecur/ui";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const CUSTODY = [
  {
    label: "Encrypted storage",
    head: "Store development secrets encrypted.",
    body: "Import the values your project needs, then remove the original plaintext file when you're ready. Local Mode keeps an encrypted store on your machine; hosted mode stores values remotely.",
  },
  {
    label: "Runtime injection",
    head: "Load secrets when your command starts.",
    body: "Run your app through insecur. It injects the selected values into the child process environment, so you don't have to paste them into a project file for each run.",
  },
  {
    label: "Recorded access",
    head: "Review recorded secret use.",
    body: "The hosted audit trail records secret grants and use. It helps you review access through insecur, but it cannot detect every read or leak inside the running process.",
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
          <Eyebrow>Experimental developer tool</Eyebrow>
          <h1 className="mt-6 max-w-5xl text-6xl leading-none font-semibold tracking-tighter text-balance sm:text-7xl lg:text-9xl">
            Run your app without plaintext <span className="text-signal">.env</span> files.
          </h1>
          <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
            Store development secrets encrypted and inject them when you run a command. Keep
            credentials out of project files and routine copy-paste workflows.
          </p>
          <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Under development. An agent controlling the running process can still read its injected
            secrets. Not ready for valuable production secrets. There is no public sign-up yet;
            Local Mode runs the same loop on your machine with no account.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="/docs/quickstart">Try the development workflow</a>
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

// The accountless Local Mode loop: what a first-time visitor can run today without sign-up.
const TERMINAL_LINES = [
  "insecur init",
  "insecur secrets set SESSION_SIGNING_KEY --generate",
  "insecur run --variable-key SESSION_SIGNING_KEY -- npm start",
] as const;

function Terminal() {
  return (
    <div className="mt-16 sm:mt-20 lg:ml-auto lg:max-w-3xl">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs text-muted-foreground">
            ~/app · after installing insecur, no account
          </span>
          <span className="font-mono text-xs tracking-widest text-signal uppercase">
            Local Mode example
          </span>
        </div>
        <div className="flex flex-col gap-2 overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed">
          {TERMINAL_LINES.map((line) => (
            <p key={line} className="terminal-line">
              <span className="text-muted-foreground select-none">$ </span>
              {line}
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
          What the development workflow does.
        </h2>
        <div className="mt-12 grid gap-y-12 md:grid-cols-3 md:gap-y-0 md:divide-x md:divide-border">
          {CUSTODY.map((item, i) => (
            <div
              key={item.label}
              className={cn("flex flex-col gap-4", i > 0 && "md:pl-8", i < 2 && "md:pr-8")}
            >
              <p className="text-3xl leading-none font-semibold tracking-tight">{item.label}</p>
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
        <Eyebrow>Where we want to go</Eyebrow>
        <h2 className="mt-6 max-w-4xl text-4xl leading-none font-semibold tracking-tighter text-balance sm:text-6xl lg:text-7xl">
          An agent read a secret. Replacing it should be easy.
        </h2>
        <div className="mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[46ch] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            The goal is one-button recovery after an accidental exposure: replace the credential,
            update where it is used, and revoke the old one. Automatic rotation is not available
            today. Changing a value stored in insecur does not revoke it at its provider.
          </p>
          <Button asChild size="lg" className="shrink-0">
            <a href="/docs">Read the docs</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
