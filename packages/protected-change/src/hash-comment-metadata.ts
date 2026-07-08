export interface CommentMetadata {
  readonly commentLength?: number;
  readonly commentSha256?: string;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Derives metadata-only verifier material for an optional Approval Context Note.
 * The note itself is Sensitive Metadata and is never stored here; we persist only its
 * UTF-8 byte length and a real SHA-256 digest so a stored comment can be verified against
 * a later-supplied plaintext without revealing it.
 */
export async function hashCommentMetadata(comment: string | undefined): Promise<CommentMetadata> {
  if (comment === undefined || comment.length === 0) {
    return {};
  }
  const encoded = new TextEncoder().encode(comment);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return {
    commentLength: encoded.byteLength,
    commentSha256: `sha256:${toHex(new Uint8Array(digest))}`,
  };
}
