import { describe, expect, it } from "vitest";
import { sanitizeScanDisplayPath } from "../src/scan/scan-display.js";

describe("sanitizeScanDisplayPath", () => {
  it("strips ANSI escapes and control characters from paths", () => {
    const hostile = `~\u001B[31m/.ssh\u0007/id_rsa`;
    expect(sanitizeScanDisplayPath(hostile)).toBe("~/.ssh?/id_rsa");
  });
});
