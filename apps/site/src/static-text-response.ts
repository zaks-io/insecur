import { SECURITY_HEADERS } from "./security-headers.js";

const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

export function staticTextResponse(body: string, contentType: string, method: string): Response {
  const bytes = new TextEncoder().encode(body);
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
    "Content-Length": String(bytes.byteLength),
    ...SECURITY_HEADERS,
  };
  if (method === "HEAD") {
    return new Response(null, { headers });
  }
  if (method !== "GET") {
    return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return new Response(bytes, { headers });
}
