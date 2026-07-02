import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/**
 * The insecur wordmark, set in the display face. The dropped final "e" is the brand; the mark
 * carries the truncated spelling as-is rather than decorating it. Presentational only (ADR-0078).
 * The full word is exposed to assistive tech via aria-label.
 */
export function Wordmark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="wordmark"
      role="img"
      className={cn("font-display text-xl leading-none font-normal lowercase", className)}
      aria-label="insecure"
      {...props}
    >
      <span aria-hidden>insecur</span>
    </span>
  );
}
