import { bytesToBase64Url } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { computeSecretWriteDescriptiveVerdicts } from "../src/secret-write-descriptive-verdicts.js";

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("computeSecretWriteDescriptiveVerdicts", () => {
  it("computes exact byte length from encoded UTF-8 bytes", () => {
    expect(computeSecretWriteDescriptiveVerdicts({ valueUtf8: utf8("café") }).valueByteLength).toBe(
      5,
    );
  });

  it.each([
    { label: "plain text", value: "postgres://user:pass@localhost/db", encodingClass: "utf-8" },
    {
      label: "hex-charset payload decodes as base64url",
      value: "0123456789abcdef0123456789abcdef",
      encodingClass: "base64-shaped",
    },
    {
      label: "base64-shaped",
      value: bytesToBase64Url(utf8("hello")),
      encodingClass: "base64-shaped",
    },
    {
      label: "all-hex-chars even-length valid base64url",
      value: "AAAA",
      encodingClass: "base64-shaped",
    },
    {
      label: "all-hex-chars even-length valid base64url (12-byte payload)",
      value: "0123456789abcdef",
      encodingClass: "base64-shaped",
    },
  ])("classifies encoding as $encodingClass for $label", ({ value, encodingClass }) => {
    expect(computeSecretWriteDescriptiveVerdicts({ valueUtf8: utf8(value) }).encodingClass).toBe(
      encodingClass,
    );
  });

  it.each([
    { value: "", isEmpty: true },
    { value: "secret", isEmpty: false },
  ])("reports isEmpty=$isEmpty for value length", ({ value, isEmpty }) => {
    expect(computeSecretWriteDescriptiveVerdicts({ valueUtf8: utf8(value) }).isEmpty).toBe(isEmpty);
  });

  it.each([
    {
      label: "classic trailing newline from .env stdin",
      value: "api_secret_value_123\n",
      expected: true,
    },
    { label: "leading space", value: " secret", expected: true },
    { label: "trailing tab", value: "secret\t", expected: true },
    { label: "internal whitespace only", value: "a secret value", expected: false },
    { label: "trimmed secret", value: "secret", expected: false },
  ])("detects leading/trailing whitespace for $label", ({ value, expected }) => {
    expect(
      computeSecretWriteDescriptiveVerdicts({ valueUtf8: utf8(value) })
        .hasLeadingOrTrailingWhitespace,
    ).toBe(expected);
  });

  it.each([
    { value: "placeholder", expected: true },
    { value: "CHANGE_ME", expected: true },
    { value: "your_api_key_here", expected: true },
    { value: "<YOUR_API_KEY>", expected: true },
    { value: "{{SECRET}}", expected: true },
    { value: "xxxxxxxx", expected: true },
    { value: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))), expected: false },
    { value: "cntv_7f3a9b2e4d1c8a6f0b5e9001", expected: false },
  ])("placeholder heuristic for $value", ({ value, expected }) => {
    expect(
      computeSecretWriteDescriptiveVerdicts({ valueUtf8: utf8(value) }).looksLikePlaceholder,
    ).toBe(expected);
  });

  it.each([
    {
      generationHint: "random:3",
      value: "AAAA",
      verdict: "matches",
    },
    {
      generationHint: "random:12",
      value: "0123456789abcdef",
      verdict: "matches",
    },
    {
      generationHint: null,
      value: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
      verdict: "no_shape_rule",
    },
    {
      generationHint: "random:32",
      value: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
      verdict: "matches",
    },
    {
      generationHint: "random:32",
      value: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      verdict: "does_not_match",
    },
    {
      generationHint: "random:32",
      value: "not-base64-shaped",
      verdict: "does_not_match",
    },
    {
      generationHint: "unsupported:rule",
      value: "secret",
      verdict: "no_shape_rule",
    },
  ])(
    "shape match verdict is $verdict for hint=$generationHint",
    ({ generationHint, value, verdict }) => {
      expect(
        computeSecretWriteDescriptiveVerdicts({
          valueUtf8: utf8(value),
          generationHint,
        }).secretShapeMatchVerdict,
      ).toBe(verdict);
    },
  );

  it("does not include digests, hashes, or similarity fields", () => {
    const verdicts = computeSecretWriteDescriptiveVerdicts({
      valueUtf8: utf8("secret"),
    });
    const serialized = JSON.stringify(verdicts);
    expect(serialized).not.toMatch(/digest|hash|checksum|similarity|prefix/i);
    expect(Object.keys(verdicts).sort()).toEqual([
      "encodingClass",
      "hasLeadingOrTrailingWhitespace",
      "isEmpty",
      "looksLikePlaceholder",
      "secretShapeMatchVerdict",
      "valueByteLength",
    ]);
  });
});
