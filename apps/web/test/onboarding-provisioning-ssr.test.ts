import { generateCsrfToken, INSECUR_CSRF_COOKIE } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { provisionWorkspaceForRequest } from "../src/onboarding/provision-workspace.js";
import { mintOnboardingResourceIds } from "../src/onboarding/provisioning.js";
import { provisionErrorVoice } from "../src/onboarding/wizard-voice.js";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
} from "./support/fake-browser-session.js";
import {
  createFakeApiBinding,
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
  type FakeApiCall,
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// Wizard mutation seam test (INS-374, harness from INS-369): drives the provisioning server-fn's
// full decision path (CSRF double-submit -> session cookie -> actor -> scoped-token API hop ->
// envelope -> outcome) with fakes only. Only the TanStack/Cloudflare glue is out of frame.
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

const PROVISION_PATH = "/v1/onboarding/personal-organization";

function wizardMutationRequest(csrfToken: string): Request {
  return ssrRequest("/onboarding", {
    method: "POST",
    sessionCookie: FAKE_SEALED_SESSION,
    headers: { Cookie: `${INSECUR_CSRF_COOKIE}=${csrfToken}` },
  });
}

function provisionDeps(options: {
  readonly handlers?: Readonly<Record<string, (request: Request) => Response | Promise<Response>>>;
  readonly request: Request;
}) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(options.handlers ?? {});
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });
  const resolveApi = async () => {
    const resolved = await resolveBrowserActor(options.request, env);
    return resolved.ok ? apiClientFor(env, resolved.actor) : null;
  };
  return { calls, resolveApi };
}

function submission(csrfToken: string, resourceIds = mintOnboardingResourceIds()) {
  return {
    csrfToken,
    organizationName: "Acme Corp",
    projectName: "Payments",
    resourceIds,
  };
}

describe("provisionWorkspaceForRequest", () => {
  it("provisions over the scoped-token hop and hands back the exact minted IDs", async () => {
    const csrfToken = generateCsrfToken();
    const resourceIds = mintOnboardingResourceIds();
    const request = wizardMutationRequest(csrfToken);
    const bodies: unknown[] = [];
    const deps = provisionDeps({
      request,
      handlers: {
        [PROVISION_PATH]: async (incoming) => {
          bodies.push(await incoming.json());
          return Response.json({ ok: true, data: resourceIds });
        },
      },
    });
    const calls = deps.calls;

    const outcome = await provisionWorkspaceForRequest(
      { cookieHeader: request.headers.get("Cookie"), resolveApi: deps.resolveApi },
      submission(csrfToken, resourceIds),
    );

    // Handoff IDs correctness: the outcome carries the exact IDs the API returned.
    expect(outcome).toEqual({
      ok: true,
      workspace: {
        organizationId: resourceIds.organizationId,
        projectId: resourceIds.projectId,
        environmentId: resourceIds.developmentEnvironmentId,
      },
    });

    // The private hop carries only the server-minted scoped bearer; no browser cookie crosses it.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe(PROVISION_PATH);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    expect(bodies[0]).toEqual({
      organizationDisplayName: "Acme Corp",
      projectDisplayName: "Payments",
      resourceIds,
    });
  });

  it("fails closed on a CSRF mismatch before anything reaches the API hop", async () => {
    const request = wizardMutationRequest(generateCsrfToken());
    const deps = provisionDeps({ request });

    const outcome = await provisionWorkspaceForRequest(
      { cookieHeader: request.headers.get("Cookie"), resolveApi: deps.resolveApi },
      submission(generateCsrfToken()),
    );

    expect(outcome).toEqual({ ok: false, code: "web.csrf_rejected" });
    expect(deps.calls).toHaveLength(0);
  });

  it("returns auth.required when no session resolves, without an API hop", async () => {
    const csrfToken = generateCsrfToken();
    const request = ssrRequest("/onboarding", {
      method: "POST",
      headers: { Cookie: `${INSECUR_CSRF_COOKIE}=${csrfToken}` },
    });
    const deps = provisionDeps({ request });

    const outcome = await provisionWorkspaceForRequest(
      { cookieHeader: request.headers.get("Cookie"), resolveApi: deps.resolveApi },
      submission(csrfToken),
    );

    expect(outcome).toEqual({ ok: false, code: "auth.required" });
    expect(deps.calls).toHaveLength(0);
  });

  it("rejects an invalid Display Name before the API hop", async () => {
    const csrfToken = generateCsrfToken();
    const request = wizardMutationRequest(csrfToken);
    const deps = provisionDeps({ request });

    const outcome = await provisionWorkspaceForRequest(
      { cookieHeader: request.headers.get("Cookie"), resolveApi: deps.resolveApi },
      { ...submission(csrfToken), organizationName: "   " },
    );

    expect(outcome).toEqual({ ok: false, code: "validation.display_name_empty" });
    expect(deps.calls).toHaveLength(0);
  });

  it("passes the create-only clean conflict through to the continue-forward voice", async () => {
    const csrfToken = generateCsrfToken();
    const request = wizardMutationRequest(csrfToken);
    const deps = provisionDeps({
      request,
      handlers: {
        [PROVISION_PATH]: () =>
          Response.json(
            {
              ok: false,
              error: { code: "onboarding.resource_conflict", message: "wire", retryable: false },
            },
            { status: 409 },
          ),
      },
    });

    const outcome = await provisionWorkspaceForRequest(
      { cookieHeader: request.headers.get("Cookie"), resolveApi: deps.resolveApi },
      submission(csrfToken),
    );

    expect(outcome).toEqual({ ok: false, code: "onboarding.resource_conflict" });
    if (outcome.ok) {
      return;
    }
    expect(provisionErrorVoice(outcome.code).action).toBe("continue-to-handoff");
  });
});
