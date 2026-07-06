import { testSessionSigningSecret } from "@insecur/auth/testing";
import type { RequestId, UserId } from "@insecur/domain";
import type { WebEnv } from "../../src/env.js";
import type { RuntimeAdmissionRpc } from "../../src/runtime/admission-types.js";

export const FAKE_INSTANCE_ID = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";

export interface FakeAdmissionDenial {
  readonly instanceId: string;
  readonly workosUserId: string;
  readonly requestId: RequestId;
}

/**
 * In-memory stand-in for the private `RUNTIME` Service Binding's pre-auth admission seam
 * (ADR-0077): admits exactly the WorkOS subjects in `admissions` and records every denial so tests
 * can assert the audit hop. Mirrors `apps/api/test/support/fake-runtime-binding.ts` in shape, but
 * the Web BFF only holds the two admission methods, so no Runtime composition is needed.
 */
export function createFakeRuntimeAdmissionBinding(
  admissions: Readonly<Record<string, UserId>> = {},
): { readonly runtime: RuntimeAdmissionRpc; readonly deniedCalls: FakeAdmissionDenial[] } {
  const admitted = new Map(Object.entries(admissions));
  const deniedCalls: FakeAdmissionDenial[] = [];
  const runtime: RuntimeAdmissionRpc = {
    resolveAdmission: (input) =>
      Promise.resolve({
        ok: true,
        value: { userId: admitted.get(input.workosUserId) ?? null },
      }),
    recordAdmissionDenied: (input) => {
      deniedCalls.push(input);
      return Promise.resolve({ ok: true, value: { recorded: true } });
    },
  };
  return { runtime, deniedCalls };
}

export interface FakeApiCall {
  readonly url: URL;
  readonly headers: Headers;
}

/**
 * Fake `API` Service Binding: JSON handlers keyed by pathname, recording every call so tests can
 * assert the server-minted scoped-token hop (and that browser cookies never cross it). Unhandled
 * paths fail closed with the API edge's `auth.required` envelope.
 */
export function createFakeApiBinding(
  handlers: Readonly<Record<string, (request: Request) => Response | Promise<Response>>> = {},
): { readonly api: Fetcher; readonly calls: FakeApiCall[] } {
  const calls: FakeApiCall[] = [];
  const api = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      calls.push({ url: new URL(request.url), headers: request.headers });
      const handler = handlers[new URL(request.url).pathname];
      if (handler === undefined) {
        return Response.json({ ok: false, error: { code: "auth.required" } }, { status: 401 });
      }
      return handler(request);
    },
  } as unknown as Fetcher;
  return { api, calls };
}

/** Fake `API` binding for tests where the API hop must never happen. */
export function unusedApiBinding(): Fetcher {
  return { fetch: () => Promise.reject(new Error("API binding not used")) } as unknown as Fetcher;
}

/**
 * Complete `WebEnv` fixture: deterministic test-only signing material, Cloudflare's documented
 * Turnstile dummy keys, and fail-closed bindings (no admissions, API hop rejected). Override the
 * bindings per test. No value here is a real credential.
 */
export function createFakeWebEnv(overrides: Partial<WebEnv> = {}): WebEnv {
  return {
    WORKOS_API_KEY: "sk_test_fake",
    WORKOS_CLIENT_ID: "client_fake",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    INSTANCE_ID: FAKE_INSTANCE_ID,
    API: unusedApiBinding(),
    RUNTIME: createFakeRuntimeAdmissionBinding().runtime,
    ...overrides,
  };
}
