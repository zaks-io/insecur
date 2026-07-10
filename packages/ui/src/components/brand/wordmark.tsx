import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/**
 * The insecur wordmark: the truncated spelling in a tight semibold, closed by a signal-red full
 * stop — the missing "e" is the brand and the red point is its one accent. Presentational only
 * (ADR-0078). The full word is exposed to assistive tech via aria-label.
 */
export function Wordmark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="wordmark"
      role="img"
      className={cn(
        "inline-flex items-baseline text-lg leading-none font-semibold tracking-tight lowercase",
        className,
      )}
      aria-label="insecure"
      {...props}
    >
      <span aria-hidden>insecur</span>
      <span aria-hidden className="ml-[0.08em] inline-block size-[0.28em] bg-signal" />
    </span>
  );
}
