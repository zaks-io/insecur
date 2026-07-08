import { describe, expect, it } from "vitest";

import { hashCommentMetadata } from "../src/hash-comment-metadata.js";

async function expectedSha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("hashCommentMetadata", () => {
  it("returns empty metadata when the comment is undefined", async () => {
    expect(await hashCommentMetadata(undefined)).toEqual({});
  });

  it("returns empty metadata for an empty-string comment", async () => {
    expect(await hashCommentMetadata("")).toEqual({});
  });

  it("reports the UTF-8 byte length and a real SHA-256 digest for an ASCII comment", async () => {
    const result = await hashCommentMetadata("hello");

    expect(result.commentLength).toBe(5);
    expect(result.commentSha256).toBe(`sha256:${await expectedSha256Hex("hello")}`);
    // 32-byte digest hex-encoded is 64 chars; guards against the old fake byte-length "hash".
    expect(result.commentSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces different digests for different comments of the same byte length", async () => {
    const a = await hashCommentMetadata("aaaaa");
    const b = await hashCommentMetadata("bbbbb");

    expect(a.commentLength).toBe(b.commentLength);
    expect(a.commentSha256).not.toBe(b.commentSha256);
  });

  it("counts multi-byte characters by encoded byte length, not code-point count", async () => {
    // "é" is two UTF-8 bytes; "🔒" is four. String length is 3, byte length is 6.
    const comment = "é🔒";

    const result = await hashCommentMetadata(comment);

    expect(comment.length).toBe(3);
    expect(result.commentLength).toBe(6);
    expect(result.commentSha256).toBe(`sha256:${await expectedSha256Hex(comment)}`);
  });
});
