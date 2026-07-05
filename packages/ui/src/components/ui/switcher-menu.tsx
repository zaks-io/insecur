import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Slot } from "radix-ui";
import { cn } from "#lib/utils";

/** Close the disclosure on Escape or on any pointer press outside of it. */
function useDismiss(rootRef: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        close();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rootRef, open, close]);
}

function SwitcherTrigger({
  open,
  panelId,
  onToggle,
  label,
  meta,
}: {
  open: boolean;
  panelId: string;
  onToggle: () => void;
  label: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className={cn(
        "flex max-w-72 items-center gap-3 border-2 border-ink px-3 py-1.5 text-left transition-colors",
        open ? "bg-ink text-paper" : "bg-background hover:bg-ink/5",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm leading-tight font-semibold">{label}</span>
        {meta ? (
          <span className="truncate font-mono text-[0.65rem] leading-tight opacity-60">{meta}</span>
        ) : null}
      </span>
      <span aria-hidden className="text-[0.6rem]">
        ▼
      </span>
    </button>
  );
}

/**
 * A disclosure-pattern switcher (APG disclosure navigation): a bordered trigger that reveals a
 * hard-edged anchored panel of links. Positioned entirely with CSS classes, no floating-ui or
 * popper inline styles, so it renders under the strict `style-src 'self' 'nonce-…'` CSP, which
 * blocks style attributes. Presentational only (ADR-0078); items are passed in by the caller.
 */
export function SwitcherMenu({
  label,
  meta,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { label: ReactNode; meta?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useDismiss(rootRef, open, () => {
    setOpen(false);
  });

  return (
    <div ref={rootRef} data-slot="switcher-menu" className={cn("relative", className)} {...props}>
      <SwitcherTrigger
        open={open}
        panelId={panelId}
        onToggle={() => {
          setOpen((value) => !value);
        }}
        label={label}
        {...(meta !== undefined ? { meta } : {})}
      />
      {open ? (
        <div
          id={panelId}
          data-slot="switcher-menu-panel"
          onClick={() => {
            setOpen(false);
          }}
          className="absolute top-full left-0 z-50 mt-2 min-w-60 border-2 border-ink bg-background py-1"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** One switcher entry. Pass `asChild` to render a router link; hover inverts to ink-on-paper. */
export function SwitcherMenuItem({
  selected = false,
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<"a"> & { selected?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="switcher-menu-item"
      data-selected={selected || undefined}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-2.5 text-sm no-underline transition-colors",
        "hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper",
        selected && "font-semibold",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

/** Selection mark for switcher entries: a filled square when selected, an outline when not. */
export function SwitcherMenuMark({ selected = false }: { selected?: boolean }) {
  return (
    <span
      aria-hidden
      data-slot="switcher-menu-mark"
      className={cn("size-2 shrink-0 border border-current", selected && "bg-current")}
    />
  );
}
