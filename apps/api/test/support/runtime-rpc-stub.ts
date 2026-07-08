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

const defaultResolveSessionWhoami = ok({
  sessionValid: true as const,
  sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  resolvedContext: {},
  attribution: { tier: "none" as const },
});

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
    isCliSessionRevoked: vi.fn(() => Promise.resolve(ok({ revoked: false }))),
    recordAdmissionDenied: vi.fn(() => Promise.resolve(ok({ recorded: true as const }))),
    recordAbuseDenied: vi.fn(() => Promise.resolve(ok({ recorded: true as const }))),
    getBootstrapStatus: vi.fn(),
    provisionGuidedOrganization: vi.fn(),
    createOperatorOrganization: vi.fn(),
    createInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    getOperation: vi.fn(),
    cancelOperation: vi.fn(),
    issueInjectionGrant: vi.fn(),
    recordInjectionRunCompleted: vi.fn(),
    captureFirstValueFeedback: vi.fn(),
    completeBootstrapOperatorClaim: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    listEnvironments: vi.fn(),
    createEnvironment: vi.fn(),
    listProjectSecrets: vi.fn(),
    listEnvironmentSecrets: vi.fn(),
    listSecretVersions: vi.fn(),
    listSessionOrganizations: vi.fn(),
    revokeCliSession: vi.fn(() => Promise.resolve(ok({ revoked: true }))),
    resolveSessionWhoami: vi.fn(() => Promise.resolve(defaultResolveSessionWhoami)),
    listOrganizationMembers: vi.fn(),
    listOrganizationInvitations: vi.fn(),
    listAuditEvents: vi.fn(),
    queryFirstValueUsage: vi.fn(),
    listPendingHighAssuranceChallenges: vi.fn(),
    getHighAssuranceChallenge: vi.fn(),
    clearHighAssuranceChallenge: vi.fn(),
    denyHighAssuranceChallenge: vi.fn(),
  };
}
