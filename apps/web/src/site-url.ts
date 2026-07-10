/**
 * Public site origin for the environment serving this request, so a preview console links to the
 * preview docs and local dev links to the local Site Worker instead of crossing into prod.
 * Pure and host-derived: the server passes the request host through the start context and the
 * browser reads window.location, so SSR and hydration agree.
 */
export function siteOrigin(host: string | undefined): string {
  if (host === "app.preview.insecur.cloud") {
    return "https://preview.insecur.cloud";
  }
  if (host !== undefined && (host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
    return "http://localhost:8789";
  }
  return "https://insecur.cloud";
}
