import { getGlobalStartContext } from "@tanstack/react-start";
import { siteOrigin } from "../site-url.js";

/**
 * Public site origin for the environment serving this render. The server reads the request host
 * from the start context and the browser reads window.location, so SSR and hydration agree.
 */
export function useSiteOrigin(): string {
  return siteOrigin(readRequestHost());
}

function readRequestHost(): string | undefined {
  try {
    const host = getGlobalStartContext()?.host;
    if (host !== undefined) {
      return host;
    }
  } catch {
    // Outside a server request; fall through to the browser location.
  }
  return typeof window !== "undefined" ? window.location.host : undefined;
}
