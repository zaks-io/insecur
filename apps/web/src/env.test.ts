import { beforeEach, describe, expect, it, vi } from "vitest";
import { asWebEnv } from "./env.js";

const getContext = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ getGlobalStartContext: getContext }));

describe("request-scoped Worker bindings", () => {
  beforeEach(() => {
    getContext.mockReset();
  });

  it("uses instrumented request bindings for both API fetch and admission RPC", () => {
    const requestEnv = { API: { fetch: vi.fn() }, RUNTIME: { resolveAdmission: vi.fn() } };
    getContext.mockReturnValue({ workerEnv: requestEnv });
    expect(asWebEnv({} as Cloudflare.Env)).toBe(requestEnv);
  });

  it("preserves explicit bindings when called outside a Start request", () => {
    const supplied = {} as Cloudflare.Env;
    getContext.mockImplementation(() => {
      throw new Error("No request context");
    });
    expect(asWebEnv(supplied)).toBe(supplied);
  });
});
