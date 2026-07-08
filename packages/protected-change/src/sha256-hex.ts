/**
 * Shared, metadata-only SHA-256 hex digest helper.
 *
 * Both the Approval Impact Review Fingerprint and the Approval Context Note verifier hash
 * metadata-only strings through the same primitive so the two callers cannot drift on encoding.
 * Never hash a Sensitive Value or decrypted Sensitive Metadata through this helper.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
