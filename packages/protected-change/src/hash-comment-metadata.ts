import { sha256Hex } from "./sha256-hex.js";

export interface CommentMetadata {
  readonly commentLength?: number;
  readonly commentSha256?: string;
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
  return {
    commentLength: encoded.byteLength,
    commentSha256: `sha256:${await sha256Hex(comment)}`,
  };
}
