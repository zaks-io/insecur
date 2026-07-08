import { toBufferSource } from "./buffer.js";

/**
 * Fixed-width constant-time equality for two plaintext byte strings, used only by the server-side
 * possession check (INS-403). The verdict must leak nothing beyond a single match/mismatch bit: not
 * the position of the first differing byte, and not the length delta between candidate and stored
 * value.
 *
 * A naive byte loop is constant-time only across equal-length inputs and still reveals length
 * through its iteration count. Instead we key an HMAC-SHA256 with a per-call random key and compare
 * the two fixed 32-byte tags in constant time. Both inputs collapse to the same 32-byte width before
 * comparison, so neither length nor content influences the timing or the number of compared bytes.
 * The random key is per-call and discarded, so the tags are not a stored or reusable digest of the
 * value (ADR-0080 prohibits raw digests and similarity scores crossing any boundary).
 */
export async function constantTimePossessionEquals(
  candidate: Uint8Array,
  stored: Uint8Array,
): Promise<boolean> {
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    toBufferSource(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const [candidateTag, storedTag] = await Promise.all([
    crypto.subtle.sign("HMAC", key, toBufferSource(candidate)),
    crypto.subtle.sign("HMAC", key, toBufferSource(stored)),
  ]);

  return constantTimeEqualFixedWidth(new Uint8Array(candidateTag), new Uint8Array(storedTag));
}

/** Constant-time comparison of two equal-length byte arrays (the HMAC tags are both 32 bytes). */
function constantTimeEqualFixedWidth(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}
