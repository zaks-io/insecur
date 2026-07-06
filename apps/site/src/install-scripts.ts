import { staticTextResponse } from "./static-text-response.js";

export const INSTALL_SH_CONTENT_TYPE = "text/x-shellscript; charset=utf-8";
export const INSTALL_PS1_CONTENT_TYPE = "text/plain; charset=utf-8";

export function installScriptResponse(body: string, contentType: string, method: string): Response {
  return staticTextResponse(body, contentType, method);
}
