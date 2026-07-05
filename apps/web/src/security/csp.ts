const CSP_BASE_DIRECTIVES =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self'";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export interface ContentSecurityPolicyOptions {
  readonly sentryDsn?: string | undefined;
}

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: ContentSecurityPolicyOptions = {},
): string {
  const connectSrc = ["'self'"];
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, TURNSTILE_ORIGIN];
  const frameSrc = ["'self'", TURNSTILE_ORIGIN];
  const sentryOrigin = sentryDsnOrigin(options.sentryDsn);
  if (sentryOrigin) {
    connectSrc.push(sentryOrigin);
  }

  return `${CSP_BASE_DIRECTIVES}; connect-src ${connectSrc.join(" ")}; frame-src ${frameSrc.join(" ")}; script-src ${scriptSrc.join(" ")}; style-src 'self' 'nonce-${nonce}'`;
}

function sentryDsnOrigin(dsn: string | undefined): string | undefined {
  if (!dsn) {
    return undefined;
  }

  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
