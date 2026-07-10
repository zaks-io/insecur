/**
 * Console origin for the environment serving this request, so a preview session links to the
 * preview console and local dev links to the local Web Worker instead of crossing into prod.
 * Pure and host-derived: the server passes the request host through the start context and the
 * browser reads window.location, so SSR and hydration agree.
 */
export function consoleOrigin(host: string | undefined): string {
  if (host === "preview.insecur.cloud") {
    return "https://app.preview.insecur.cloud";
  }
  if (host !== undefined && (host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
    return "http://localhost:8788";
  }
  return "https://app.insecur.cloud";
}
