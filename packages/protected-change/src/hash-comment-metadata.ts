export function hashCommentMetadata(comment: string | undefined): {
  readonly commentLength?: number;
  readonly commentSha256?: string;
} {
  if (comment === undefined || comment.length === 0) {
    return {};
  }
  const encoded = new TextEncoder().encode(comment);
  return {
    commentLength: encoded.byteLength,
    commentSha256: `sha256:${String(encoded.byteLength)}`,
  };
}
