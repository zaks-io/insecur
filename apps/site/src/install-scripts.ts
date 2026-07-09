import { staticTextResponse } from "./static-text-response.js";

// text/plain (not text/x-shellscript): the docs installation page links the scripts so people can
// read them in the browser before piping to a shell, and with nosniff set browsers download
// unrecognized script types instead of rendering them. curl | sh ignores the content type.
export const INSTALL_SH_CONTENT_TYPE = "text/plain; charset=utf-8";
export const INSTALL_PS1_CONTENT_TYPE = "text/plain; charset=utf-8";

export function installScriptResponse(body: string, contentType: string, method: string): Response {
  return staticTextResponse(body, contentType, method);
}
