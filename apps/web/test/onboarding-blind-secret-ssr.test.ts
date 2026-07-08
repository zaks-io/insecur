import { generateCsrfToken, INSECUR_CSRF_COOKIE } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { blindSecretWriteForRequest } from "../src/onboarding/blind-secret-write-for-request.js";
import { parseFirstValueUsageOutcome } from "../src/onboarding/first-value-usage.js";
import { mintOnboardingResourceIds } from "../src/onboarding/provisioning.js";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
} from "./support/fake-browser-session.js";
import {
  createFakeApiBinding,
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

vi.mock("../src/auth/workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("./support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () => createFakeWorkOSSessionPort([fakeSessionEntry()]),
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
}));

const SENTINEL_VALUE = "canary-sentinel-value-do-not-echo";

function secretWritePath(workspace: {
  organizationId: string;
  projectId: string;
  environmentId: string;
}) {
  return `/v1/orgs/${workspace.organizationId}/projects/${workspace.projectId}/environments/${workspace.environmentId}/secrets/by-variable-key`;
}

function usagePath(organizationId: string) {
  return `/v1/orgs/${organizationId}/first-value-usage`;
}

function wizardMutationRequest(csrfToken: string): Request {
  return ssrRequest("/onboarding", {
    method: "POST",
    sessionCookie: FAKE_SEALED_SESSION,
    headers: { Cookie: `${INSECUR_CSRF_COOKIE}=${csrfToken}` },
  });
}

function blindWriteDeps(
  workspace: {
    organizationId: string;
    projectId: string;
    environmentId: string;
  },
  handlers: Record<string, (request: Request) => Response | Promise<Response>>,
) {
  const csrfToken = generateCsrfToken();
  const request = wizardMutationRequest(csrfToken);
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });
  const resolveApi = async () => {
    const resolved = await resolveBrowserActor(request, env);
    return resolved.ok ? apiClientFor(env, resolved.actor) : null;
  };
  return { csrfToken, workspace, resolveApi };
}

function mintWorkspace() {
  const resourceIds = mintOnboardingResourceIds();
  return {
    organizationId: resourceIds.organizationId,
    projectId: resourceIds.projectId,
    environmentId: resourceIds.developmentEnvironmentId,
  };
}

describe("blindSecretWriteForRequest", () => {
  it("writes over the scoped-token hop and never echoes the fixture value", async () => {
    const workspace = mintWorkspace();
    const bodies: unknown[] = [];
    const deps = blindWriteDeps(workspace, {
      [secretWritePath(workspace)]: async (incoming) => {
        bodies.push(await incoming.json());
        return Response.json({
          ok: true,
          data: {
            secretId: "sec_00000000000000000000000001",
            secretVersionId: "sv_00000000000000000000000001",
            variableKey: "APP_SECRET",
            createdSecretShape: true,
          },
        });
      },
    });

    const outcome = await blindSecretWriteForRequest(
      {
        cookieHeader: `${INSECUR_CSRF_COOKIE}=${deps.csrfToken}`,
        resolveApi: deps.resolveApi,
      },
      {
        csrfToken: deps.csrfToken,
        workspace: deps.workspace,
        variableKey: "APP_SECRET",
        mode: "value",
        value: SENTINEL_VALUE,
      },
    );

    expect(outcome.ok).toBe(true);
    expect(JSON.stringify(outcome)).not.toContain(SENTINEL_VALUE);
    expect(bodies[0]).toMatchObject({ variableKey: "APP_SECRET", value: SENTINEL_VALUE });
  });

  it("posts generate mode without a request-body value", async () => {
    const workspace = mintWorkspace();
    const bodies: unknown[] = [];
    const deps = blindWriteDeps(workspace, {
      [secretWritePath(workspace)]: async (incoming) => {
        bodies.push(await incoming.json());
        return Response.json({
          ok: true,
          data: {
            secretId: "sec_00000000000000000000000001",
            secretVersionId: "sv_00000000000000000000000001",
            variableKey: "APP_SECRET",
            createdSecretShape: true,
          },
        });
      },
    });

    const outcome = await blindSecretWriteForRequest(
      { cookieHeader: `${INSECUR_CSRF_COOKIE}=${deps.csrfToken}`, resolveApi: deps.resolveApi },
      {
        csrfToken: deps.csrfToken,
        workspace: deps.workspace,
        variableKey: "APP_SECRET",
        mode: "generate",
      },
    );

    expect(outcome.ok).toBe(true);
    expect(bodies[0]).toMatchObject({
      variableKey: "APP_SECRET",
      generate: { mode: "random", lengthBytes: 32 },
    });
    expect(bodies[0]).not.toHaveProperty("value");
  });

  it("rejects missing CSRF before the API hop", async () => {
    const workspace = mintWorkspace();
    const deps = blindWriteDeps(workspace, {});
    const outcome = await blindSecretWriteForRequest(
      { cookieHeader: null, resolveApi: deps.resolveApi },
      {
        csrfToken: deps.csrfToken,
        workspace: deps.workspace,
        variableKey: "APP_SECRET",
        mode: "generate",
      },
    );
    expect(outcome).toMatchObject({ ok: false, code: "web.csrf_rejected" });
  });
});

describe("parseFirstValueUsageOutcome", () => {
  it("flips firstInjectionObserved when grant consumption is present", () => {
    expect(
      parseFirstValueUsageOutcome({
        ok: true,
        data: {
          secretWrites: 1,
          grantConsumed: 1,
          runCompleted: 0,
          firstInjectionObserved: true,
        },
      }),
    ).toMatchObject({
      ok: true,
      status: { firstInjectionObserved: true, grantConsumed: 1 },
    });
  });
});

describe("first-value usage poll path", () => {
  it("reads usage status over the scoped-token hop", async () => {
    const workspace = mintWorkspace();
    const deps = blindWriteDeps(workspace, {
      [usagePath(workspace.organizationId)]: () =>
        Response.json({
          ok: true,
          data: {
            secretWrites: 0,
            grantConsumed: 0,
            runCompleted: 0,
            firstInjectionObserved: false,
          },
        }),
    });
    const api = await deps.resolveApi();
    expect(api).not.toBeNull();
    if (api === null) {
      throw new Error("expected api client");
    }
    const body: unknown = await api.firstValueUsage(deps.workspace.organizationId);
    expect(body).toMatchObject({
      ok: true,
      data: { firstInjectionObserved: false },
    });
  });
});
