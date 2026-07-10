import { describe, expect, it } from "vitest";

import config from "../playwright.preview.config";

describe("preview smoke diagnostics", () => {
  it("keeps safe failure diagnostics while disabling credential-bearing traces", () => {
    expect(config.use?.trace).toBe("off");
    expect(config.use?.screenshot).toBe("only-on-failure");
    expect(config.use?.video).toBe("retain-on-failure");
    expect(config.reporter).toEqual(
      expect.arrayContaining([
        ["html", expect.any(Object)],
        ["json", expect.any(Object)],
        ["junit", expect.any(Object)],
      ]),
    );
  });
});
