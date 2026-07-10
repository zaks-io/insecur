import { describe, expect, it } from "vitest";
import { siteOrigin } from "./site-url.js";

describe("siteOrigin", () => {
  it("links the production console to the production site", () => {
    expect(siteOrigin("app.insecur.cloud")).toBe("https://insecur.cloud");
  });

  it("keeps preview sessions inside preview", () => {
    expect(siteOrigin("app.preview.insecur.cloud")).toBe("https://preview.insecur.cloud");
  });

  it("links local dev to the local Site Worker", () => {
    expect(siteOrigin("localhost:8788")).toBe("http://localhost:8789");
    expect(siteOrigin("127.0.0.1:8788")).toBe("http://localhost:8789");
  });

  it("falls back to production when the host is unknown", () => {
    expect(siteOrigin(undefined)).toBe("https://insecur.cloud");
  });
});
