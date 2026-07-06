export const INSTALL_SH_CONTENT_TYPE = "text/x-shellscript; charset=utf-8";
export const INSTALL_PS1_CONTENT_TYPE = "text/plain; charset=utf-8";

// Short cache so an installer fix propagates within minutes while still absorbing
// launch-day traffic at the edge.
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

export function installScriptResponse(body: string, contentType: string, method: string): Response {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
  };
  if (method === "HEAD") {
    return new Response(null, { headers });
  }
  if (method !== "GET") {
    return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return new Response(body, { headers });
}
