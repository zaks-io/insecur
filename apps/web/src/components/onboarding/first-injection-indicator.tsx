import { useEffect, useRef, useState } from "react";
import { loadFirstValueUsage } from "../../server/first-value-usage.js";

const POLL_INTERVAL_MS = 4000;

function WaitingIndicator() {
  return (
    <section aria-live="polite" className="border-b-2 border-ink px-6 py-5">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
        Waiting for your first run
      </p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Run the commands below in your terminal. This page updates when your first Runtime Injection
        lands.
      </p>
    </section>
  );
}

function CelebrationIndicator() {
  return (
    <section aria-live="polite" className="border-b-2 border-ink bg-ink px-6 py-5 text-background">
      <p className="font-display text-xl leading-tight sm:text-2xl">First injection observed.</p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-background/80">
        Your CLI run consumed a Runtime Injection grant. The secret reached your process without
        ever appearing on screen here.
      </p>
    </section>
  );
}

/**
 * Live "waiting for your first run" indicator on the CLI handoff pane (INS-379). Polls the
 * metadata-only First Value usage endpoint and celebrates the first Runtime Injection.
 */
export function FirstInjectionIndicator({ organizationId }: { organizationId: string }) {
  const [observed, setObserved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const outcome = await loadFirstValueUsage({ data: organizationId });
        if (!cancelled && outcome.ok && outcome.status.firstInjectionObserved) {
          setObserved(true);
        }
      } catch {
        // Keep polling on transient failures; the indicator is best-effort.
      }
    };

    void poll();
    intervalRef.current = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current !== undefined) {
        clearInterval(intervalRef.current);
      }
    };
  }, [organizationId]);

  return observed ? <CelebrationIndicator /> : <WaitingIndicator />;
}
