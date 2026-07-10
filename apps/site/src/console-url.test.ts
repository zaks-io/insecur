import { describe, expect, it } from "vitest";
import { consoleOrigin } from "./console-url.js";

describe("consoleOrigin", () => {
  it("links production hosts to the production console", () => {
    expect(consoleOrigin("insecur.cloud")).toBe("https://app.insecur.cloud");
    expect(consoleOrigin("www.insecur.cloud")).toBe("https://app.insecur.cloud");
    expect(consoleOrigin("insecur.dev")).toBe("https://app.insecur.cloud");
  });

  it("keeps preview sessions inside preview", () => {
    expect(consoleOrigin("preview.insecur.cloud")).toBe("https://app.preview.insecur.cloud");
  });

  it("links local dev to the local Web Worker", () => {
    expect(consoleOrigin("localhost:8789")).toBe("http://localhost:8788");
    expect(consoleOrigin("127.0.0.1:8789")).toBe("http://localhost:8788");
  });

  it("falls back to production when the host is unknown", () => {
    expect(consoleOrigin(undefined)).toBe("https://app.insecur.cloud");
  });
});
