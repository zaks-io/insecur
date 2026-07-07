import { staticTextResponse } from "./static-text-response.js";

const CONTENT_TYPE = "application/json; charset=utf-8";

export function badgeJsonResponse(body: unknown, method: string): Response {
  return staticTextResponse(`${JSON.stringify(body)}\n`, CONTENT_TYPE, method);
}
