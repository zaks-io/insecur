import { Button } from "@insecur/ui";
import { SiteFrame } from "./site-frame.js";

/**
 * Retry surface for a signed-in console load whose API hop failed. Preserves the session: no
 * cookie clear, no login redirect (INS-415).
 */
export function ConsoleUnavailableSurface({
  onRetry,
  framed = false,
}: {
  onRetry: () => void;
  /** When true, render inline inside an existing console/onboarding frame. */
  framed?: boolean;
}) {
  const sectionClassName = framed ? "px-5 py-8 sm:px-8 sm:py-10" : "px-5 py-10 sm:px-8 sm:py-12";
  const panel = (
    <section className={sectionClassName}>
      <div className="max-w-xl border-2 border-ink px-6 py-6">
        <p className="font-mono text-xs text-muted-foreground">Service unavailable</p>
        <h1 className="mt-1 font-display text-2xl leading-tight">We couldn't reach insecur</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your session is still signed in. The console couldn't load data from the service right now
          — this is usually temporary. Try again in a moment.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </section>
  );

  if (framed) {
    return panel;
  }
  return <SiteFrame>{panel}</SiteFrame>;
}
