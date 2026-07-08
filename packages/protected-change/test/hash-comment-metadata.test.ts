import { describe, expect, it } from "vitest";

import { hashCommentMetadata } from "../src/hash-comment-metadata.js";

describe("hashCommentMetadata", () => {
  it("returns empty metadata when the comment is undefined", () => {
    expect(hashCommentMetadata(undefined)).toEqual({});
  });

  it("returns empty metadata for an empty-string comment", () => {
    expect(hashCommentMetadata("")).toEqual({});
  });

  it("reports the UTF-8 byte length for an ASCII comment", () => {
    const result = hashCommentMetadata("hello");

    expect(result.commentLength).toBe(5);
    expect(result.commentSha256).toBe("sha256:5");
  });

  it("counts multi-byte characters by encoded byte length, not code-point count", () => {
    // "é" is two UTF-8 bytes; "🔒" is four. String length would be 2, byte length is 6.
    const comment = "é🔒";

    const result = hashCommentMetadata(comment);

    expect(comment.length).toBe(3);
    expect(result.commentLength).toBe(6);
    expect(result.commentSha256).toBe("sha256:6");
  });
});
