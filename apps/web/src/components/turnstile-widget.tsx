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
      readonly theme: "auto";
      readonly size: "flexible";
      readonly callback: (token: string) => void;
      readonly "expired-callback": () => void;
      readonly "error-callback": () => void;
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
  readonly onTokenChange: (token: string) => void;
  readonly siteKey: string;
  readonly turnstile: TurnstileApi;
}

function renderTurnstileWidget({
  container,
  onFailure,
  onTokenChange,
  siteKey,
  turnstile,
}: RenderTurnstileWidgetOptions): string {
  return turnstile.render(container, {
    sitekey: siteKey,
    action: TURNSTILE_LOGIN_ACTION,
    theme: "auto",
    size: "flexible",
    callback: (nextToken) => {
      onTokenChange(nextToken);
    },
    "expired-callback": () => {
      onTokenChange("");
    },
    "error-callback": onFailure,
  });
}

function useTurnstileWidget(
  siteKey: string,
  onTokenChange: (token: string) => void,
): TurnstileWidgetState {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderWidget() {
      await loadTurnstileScript();
      if (cancelled) {
        return;
      }
      const turnstile = window.turnstile;
      if (!turnstile || !containerRef.current) {
        setFailed(true);
        return;
      }

      widgetIdRef.current = renderTurnstileWidget({
        container: containerRef.current,
        siteKey,
        turnstile,
        onTokenChange: (nextToken) => {
          setFailed(false);
          onTokenChange(nextToken);
        },
        onFailure: () => {
          setFailed(true);
          onTokenChange("");
        },
      });
    }

    void renderWidget().catch(() => {
      setFailed(true);
    });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      if (widgetId !== null) {
        window.turnstile?.remove?.(widgetId);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onTokenChange]);

  return { containerRef, failed };
}

export function TurnstileWidget({
  siteKey,
  onTokenChange,
}: {
  readonly siteKey: string;
  readonly onTokenChange: (token: string) => void;
}) {
  const { containerRef, failed } = useTurnstileWidget(siteKey, onTokenChange);

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="min-h-[65px] w-full" />
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          Verification failed. Refresh and try again.
        </p>
      ) : null}
    </div>
  );
}
