import { userId } from "@insecur/domain";
import type { RuntimeRpc, RuntimeRpcResult } from "@insecur/worker-kit";
import { vi, type MockedFunction } from "vitest";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "./setup-unit-auth.js";

/**
 * A full `RuntimeRpc` stub for API route unit tests (ADR-0077 Option B). Every keyring-bound and
 * non-keyring DB operation now crosses the private Service Binding into the Runtime deploy, so these
 * route tests stub `env.RUNTIME` with canned `RuntimeRpcResult` values. `resolveAdmission` defaults
 * to admitting {@link WORKOS_USER_ID}; override individual methods per test for the path under test.
 *
 * Each method is typed as a `MockedFunction` of the real contract method so `mock.calls[i][0]` is
 * the typed RPC input (e.g. `.actorToken` is type-safe in assertions, not `any`).
 */
export type RuntimeRpcStub = {
  [K in keyof RuntimeRpc]: MockedFunction<RuntimeRpc[K]>;
};

function ok<T>(value: T): RuntimeRpcResult<T> {
  return { ok: true, value };
}

export function createRuntimeRpcStub(): RuntimeRpcStub {
  return {
    consumeGrant: vi.fn(),
    consumeGrantAll: vi.fn(),
    writeSecret: vi.fn(),
    resolveAdmission: vi.fn((input: { workosUserId: string }) =>
      Promise.resolve(
        ok({
          userId: input.workosUserId === WORKOS_USER_ID ? userId.brand(ADMITTED_USER_ID_RAW) : null,
        }),
      ),
    ),
    recordAdmissionDenied: vi.fn(() => Promise.resolve(ok({ recorded: true as const }))),
    recordAbuseDenied: vi.fn(() => Promise.resolve(ok({ recorded: true as const }))),
    getBootstrapStatus: vi.fn(),
    provisionGuidedOrganization: vi.fn(),
    createOperatorOrganization: vi.fn(),
    createInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    getOperation: vi.fn(),
    issueInjectionGrant: vi.fn(),
    recordInjectionRunCompleted: vi.fn(),
    captureFirstValueFeedback: vi.fn(),
    completeBootstrapOperatorClaim: vi.fn(),
    listProjects: vi.fn(),
    listEnvironments: vi.fn(),
  };
}
