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
      <div className="mt-2 flex items-start gap-3 bg-ink px-4 py-3 text-paper">
        <pre className="min-w-0 flex-1 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap select-all">
          <span aria-hidden className="mr-2 text-paper/50 select-none">
            $
          </span>
          {entry.command}
        </pre>
        <button
          type="button"
          onClick={() => {
            void copy();
          }}
          className="shrink-0 border border-paper/40 px-2 py-1 font-mono text-[11px] tracking-wide text-paper uppercase transition-colors outline-none select-none hover:bg-paper/10 focus-visible:ring-2 focus-visible:ring-paper/60"
        >
          {copyState === "copied" ? "Copied" : copyState === "manual" ? "Select it" : "Copy"}
        </button>
      </div>
    </div>
  );
}
