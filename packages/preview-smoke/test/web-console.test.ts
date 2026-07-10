import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { useSmokeBearer } from "../src/web-console";

describe("useSmokeBearer", () => {
  it("applies the bearer without enabling trace capture", async () => {
    const calls: string[] = [];
    const page = {
      setExtraHTTPHeaders: (headers: Record<string, string>) => {
        const authorization = headers.Authorization;
        if (authorization === undefined) {
          throw new Error("Expected Authorization header");
        }
        calls.push(`headers:${authorization}`);
        return Promise.resolve();
      },
    } as unknown as Page;

    await useSmokeBearer(page, "fake-preview-smoke-bearer");

    expect(calls).toEqual(["headers:Bearer fake-preview-smoke-bearer"]);
  });
});
