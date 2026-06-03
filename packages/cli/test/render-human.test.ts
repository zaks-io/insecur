import { describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { renderSuccess } from "../src/output/render.js";

describe("renderSuccess human output", () => {
  it("prints human-readable success text when not in json mode", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    renderSuccess(successEnvelope({ status: "ok" }), { json: false, quiet: false }, () => "ready");
    expect(stdout.mock.calls[0]?.[0]).toBe("ready\n");
    stdout.mockRestore();
  });
});
