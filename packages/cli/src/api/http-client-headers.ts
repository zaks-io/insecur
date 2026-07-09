import { cliVersion } from "../version.js";

export function cliApiHeaders(headers: HeadersInit | undefined): Headers {
  const result = new Headers(headers);
  result.set("User-Agent", `insecur-cli/${cliVersion()}`);
  return result;
}
