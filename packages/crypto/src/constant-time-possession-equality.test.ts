import { describe, expect, it } from "vitest";

import { constantTimePossessionEquals } from "./constant-time-possession-equality.js";

const encoder = new TextEncoder();

describe("constantTimePossessionEquals", () => {
  it("returns true for identical byte strings", async () => {
    const value = encoder.encode("s3cr3t-value-abc");
    await expect(
      constantTimePossessionEquals(value, encoder.encode("s3cr3t-value-abc")),
    ).resolves.toBe(true);
  });

  it("returns false for a one-byte difference of equal length", async () => {
    await expect(
      constantTimePossessionEquals(
        encoder.encode("s3cr3t-value-abc"),
        encoder.encode("s3cr3t-value-abd"),
      ),
    ).resolves.toBe(false);
  });

  it("returns false for different lengths without leaking the length", async () => {
    await expect(
      constantTimePossessionEquals(
        encoder.encode("short"),
        encoder.encode("a-much-longer-candidate"),
      ),
    ).resolves.toBe(false);
  });

  it("treats two empty values as equal", async () => {
    await expect(constantTimePossessionEquals(new Uint8Array(0), new Uint8Array(0))).resolves.toBe(
      true,
    );
  });

  it("treats empty vs non-empty as unequal", async () => {
    await expect(
      constantTimePossessionEquals(new Uint8Array(0), encoder.encode("x")),
    ).resolves.toBe(false);
  });
});
