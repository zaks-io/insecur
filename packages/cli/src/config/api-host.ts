import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { LOCAL_MODE_HOST } from "./local-mode.js";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

function invalidHost(message: string): never {
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    message,
    retryable: false,
  });
}

function parseAbsoluteUrl(rawHost: string): URL {
  try {
    return new URL(rawHost);
  } catch {
    return invalidHost("insecur API host must be an absolute HTTPS URL.");
  }
}

function assertOriginOnly(url: URL): void {
  if (url.username !== "" || url.password !== "") {
    invalidHost("insecur API host must not contain URL credentials.");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    invalidHost("insecur API host must be an origin without a path, query, or fragment.");
  }
}

export function isAllowedHttpTransport(url: URL): boolean {
  if (url.protocol === "https:") {
    return true;
  }
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(hostname);
}

export function parseApiHost(rawHost: string): string {
  if (rawHost === LOCAL_MODE_HOST) {
    return rawHost;
  }
  const url = parseAbsoluteUrl(rawHost);
  assertOriginOnly(url);
  if (isAllowedHttpTransport(url)) {
    return url.origin;
  }
  return invalidHost(
    "insecur API host must use HTTPS. Plain HTTP is allowed only for localhost, 127.0.0.1, or ::1.",
  );
}
