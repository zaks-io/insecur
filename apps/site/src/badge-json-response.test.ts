import { describe, expect, it } from "vitest";
import { badgeJsonResponse } from "./badge-json-response.js";

const BADGE = {
  schemaVersion: 1,
  label: "coverage",
  message: "74% lines",
  color: "yellow",
};

describe("badgeJsonResponse", () => {
  it("serves badge JSON with cache and site security headers", async () => {
    const response = badgeJsonResponse(BADGE, "GET");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.json()).toEqual(BADGE);
  });

  it("serves HEAD with the GET content length and no body", async () => {
    const response = badgeJsonResponse(BADGE, "HEAD");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe(
      String(new TextEncoder().encode(`${JSON.stringify(BADGE)}\n`).byteLength),
    );
    expect(await response.text()).toBe("");
  });

  it("rejects other methods", () => {
    const response = badgeJsonResponse(BADGE, "POST");

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
