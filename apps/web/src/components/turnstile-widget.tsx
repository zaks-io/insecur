import { useEffect, useRef, useState, type RefObject } from "react";
import { TURNSTILE_LOGIN_ACTION } from "../auth/turnstile.js";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  readonly render: (
    container: HTMLElement,
    options: {
      readonly sitekey: string;
      readonly action: string;
      readonly appearance: "interaction-only";
      readonly theme: "auto";
      readonly "response-field": false;
      readonly callback: (token: string) => void;
      readonly "before-interactive-callback": () => void;
      readonly "after-interactive-callback": () => void;
      readonly "expired-callback": () => void;
      readonly "error-callback": () => void;
      readonly "unsupported-callback": () => void;
    },
  ) => string;
  readonly remove?: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | undefined;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      turnstileScriptPromise = undefined;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

interface TurnstileWidgetState {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly failed: boolean;
}

interface RenderTurnstileWidgetOptions {
  readonly container: HTMLElement;
  readonly onFailure: () => void;
  readonly onInteractiveChange: (interactive: boolean) => void;
  readonly onTokenChange: (token: string) => void;
  readonly siteKey: string;
  readonly turnstile: TurnstileApi;
}

interface StartTurnstileWidgetOptions {
  readonly container: HTMLElement;
  readonly onFailure: () => void;
  readonly onTokenChange: (token: string) => void;
  readonly onInteractiveChange: (interactive: boolean) => void;
  readonly siteKey: string;
}

interface MountTurnstileWidgetOptions extends StartTurnstileWidgetOptions {
  readonly setFailed: (failed: boolean) => void;
}

function renderTurnstileWidget({
  container,
  onInteractiveChange,
  onFailure,
  onTokenChange,
  siteKey,
  turnstile,
}: RenderTurnstileWidgetOptions): string {
  return turnstile.render(container, {
    sitekey: siteKey,
    action: TURNSTILE_LOGIN_ACTION,
    appearance: "interaction-only",
    theme: "auto",
    "response-field": false,
    callback: (nextToken) => {
      onInteractiveChange(false);
      onTokenChange(nextToken);
    },
    "before-interactive-callback": () => {
      onInteractiveChange(true);
    },
    "after-interactive-callback": () => {
      onInteractiveChange(false);
    },
    "expired-callback": () => {
      onTokenChange("");
    },
    "error-callback": onFailure,
    "unsupported-callback": onFailure,
  });
}

async function startTurnstileWidget({
  container,
  onFailure,
  onInteractiveChange,
  onTokenChange,
  siteKey,
}: StartTurnstileWidgetOptions): Promise<string | null> {
  await loadTurnstileScript();
  const turnstile = window.turnstile;
  if (!turnstile) {
    return null;
  }

  return renderTurnstileWidget({
    container,
    siteKey,
    turnstile,
    onFailure,
    onInteractiveChange,
    onTokenChange,
  });
}

function failTurnstileWidget(
  setFailed: (failed: boolean) => void,
  onFailure: () => void,
  onTokenChange: (token: string) => void,
): void {
  setFailed(true);
  onFailure();
  onTokenChange("");
}

function removeTurnstileWidget(widgetId: string | null): void {
  if (widgetId !== null) {
    window.turnstile?.remove?.(widgetId);
  }
}

async function mountTurnstileWidget({
  container,
  onFailure,
  onInteractiveChange,
  onTokenChange,
  setFailed,
  siteKey,
}: MountTurnstileWidgetOptions): Promise<string | null> {
  return startTurnstileWidget({
    container,
    siteKey,
    onInteractiveChange,
    onFailure: () => {
      failTurnstileWidget(setFailed, onFailure, onTokenChange);
    },
    onTokenChange: (nextToken) => {
      setFailed(false);
      onTokenChange(nextToken);
    },
  });
}

function useTurnstileWidget(
  siteKey: string,
  onTokenChange: (token: string) => void,
  onInteractiveChange: (interactive: boolean) => void,
  onFailure: () => void,
): TurnstileWidgetState {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const failWidget = () => {
      failTurnstileWidget(setFailed, onFailure, onTokenChange);
    };
    const container = containerRef.current;
    if (container !== null) {
      void mountTurnstileWidget({
        container,
        siteKey,
        setFailed,
        onFailure,
        onInteractiveChange,
        onTokenChange,
      })
        .then((widgetId) => {
          if (cancelled) {
            removeTurnstileWidget(widgetId);
            return;
          }
          if (widgetId === null) {
            failWidget();
            return;
          }
          widgetIdRef.current = widgetId;
        })
        .catch(failWidget);
    } else {
      failWidget();
    }

    return () => {
      cancelled = true;
      removeTurnstileWidget(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey, onFailure, onInteractiveChange, onTokenChange]);

  return { containerRef, failed };
}

export function TurnstileWidget({
  siteKey,
  onFailure,
  onInteractiveChange,
  onTokenChange,
}: {
  readonly siteKey: string;
  readonly onFailure: () => void;
  readonly onInteractiveChange: (interactive: boolean) => void;
  readonly onTokenChange: (token: string) => void;
}) {
  const { containerRef, failed } = useTurnstileWidget(
    siteKey,
    onTokenChange,
    onInteractiveChange,
    onFailure,
  );

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="w-full" />
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          Verification failed. Refresh and try again.
        </p>
      ) : null}
    </div>
  );
}
