import { useCallback, useEffect, useRef, useState } from "react";
import type { CliHandoffCommand } from "../../onboarding/cli-handoff.js";

type CopyState = "idle" | "copied" | "manual";

/**
 * One terminal command in the handoff sequence: the single dark element on the paper page,
 * because this text belongs to the shell. One copy affordance per command; the copied text is
 * exactly what runs.
 */
export function CommandBlock({ entry }: { entry: CliHandoffCommand }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(entry.command);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setCopyState("idle");
    }, 2000);
  }, [entry.command]);

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">{entry.label}</p>
      <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 font-mono">
        <pre className="min-w-0 flex-1 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap select-all">
          <span aria-hidden className="mr-2 text-muted-foreground select-none">
            $
          </span>
          {entry.command}
        </pre>
        <button
          type="button"
          onClick={() => {
            void copy();
          }}
          className="shrink-0 rounded-md border border-border px-2 py-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase transition-colors outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {copyState === "copied" ? "Copied" : copyState === "manual" ? "Select it" : "Copy"}
        </button>
      </div>
    </div>
  );
}
