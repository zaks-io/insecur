const CSP_BASE_DIRECTIVES =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; connect-src 'self'; font-src 'self'";

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildContentSecurityPolicy(nonce: string): string {
  return `${CSP_BASE_DIRECTIVES}; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'`;
}
