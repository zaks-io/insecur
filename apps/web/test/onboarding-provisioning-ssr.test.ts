import { generateCsrfToken } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { isWizardMutationCsrfValid } from "../src/onboarding/csrf-check.js";
import { csrfTokenFromCookieHeader } from "../src/onboarding/csrf.js";
import {
  mintOnboardingResourceIds,
  parseProvisionOutcome,
} from "../src/onboarding/provisioning.js";
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
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// Wizard seam test (INS-374, harness from INS-369): drives the provisioning server-fn's seam
// (session cookie -> actor -> scoped-token API hop -> envelope -> outcome) with fakes only.
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

describe("onboarding provisioning seam", () => {
  it("provisions over the scoped-token hop and hands back the exact minted IDs", async () => {
    const resourceIds = mintOnboardingResourceIds();
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const bodies: unknown[] = [];
    const { api, calls } = createFakeApiBinding({
      [PROVISION_PATH]: async (request) => {
        bodies.push(await request.json());
        return Response.json({ ok: true, data: resourceIds });
      },
    });
    const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

    const resolved = await resolveBrowserActor(
      ssrRequest("/onboarding", { sessionCookie: FAKE_SEALED_SESSION }),
      env,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    const body = await apiClientFor(env, resolved.actor).provisionPersonalOrganization({
      organizationDisplayName: "Acme Corp",
      projectDisplayName: "Payments",
      resourceIds,
    });

    // Handoff IDs correctness: the outcome carries the exact IDs the API returned.
    expect(parseProvisionOutcome(body)).toEqual({
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

  it("passes the create-only clean conflict through to the continue-forward voice", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const { api } = createFakeApiBinding({
      [PROVISION_PATH]: () =>
        Response.json(
          {
            ok: false,
            error: { code: "onboarding.resource_conflict", message: "wire", retryable: false },
          },
          { status: 409 },
        ),
    });
    const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

    const resolved = await resolveBrowserActor(
      ssrRequest("/onboarding", { sessionCookie: FAKE_SEALED_SESSION }),
      env,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    const body = await apiClientFor(env, resolved.actor).provisionPersonalOrganization({
      resourceIds: mintOnboardingResourceIds(),
    });
    const outcome = parseProvisionOutcome(body);
    expect(outcome).toEqual({ ok: false, code: "onboarding.resource_conflict" });
    if (outcome.ok) {
      return;
    }
    expect(provisionErrorVoice(outcome.code).action).toBe("continue-to-handoff");
  });

  it("holds the double-submit CSRF gate on the wizard mutation request shape", () => {
    const token = generateCsrfToken();
    const request = ssrRequest("/onboarding", {
      method: "POST",
      sessionCookie: FAKE_SEALED_SESSION,
      headers: { Cookie: `insecur_csrf=${token}` },
    });
    const cookieHeader = request.headers.get("Cookie");

    expect(csrfTokenFromCookieHeader(cookieHeader)).toBe(token);
    expect(isWizardMutationCsrfValid(cookieHeader, token)).toBe(true);
    expect(isWizardMutationCsrfValid(cookieHeader, generateCsrfToken())).toBe(false);
    expect(isWizardMutationCsrfValid(cookieHeader, undefined)).toBe(false);
  });
});
