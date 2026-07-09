import { describe, expect, it } from "vitest";
import { cliApiHeaders } from "./http-client-headers.js";

describe("CLI API request headers", () => {
  it("identifies the CLI by its compiled version without dropping request headers", () => {
    const headers = cliApiHeaders({ Authorization: "Bearer test", Accept: "application/json" });

    expect(headers.get("User-Agent")).toBe("insecur-cli/0.0.0");
    expect(headers.get("Authorization")).toBe("Bearer test");
    expect(headers.get("Accept")).toBe("application/json");
  });
});
