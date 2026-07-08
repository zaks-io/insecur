import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { loginRedirectHref } from "../src/console/login-redirect.js";
import { parseOrgHighAssuranceChallengeDetailBody } from "../src/console/approval-detail-parse.js";
import { ApprovalRequestUnsupportedPanel } from "../src/components/approval-detail/approval-request-unsupported.js";
import { HighAssuranceChallengeEvidencePanel } from "../src/components/approval-detail/high-assurance-challenge-evidence.js";
import { RejectChallengePanel } from "../src/components/approval-detail/reject-challenge-panel.js";
import { HIGH_ASSURANCE_CHALLENGE_FIXTURE } from "../src/components/approval-item.test.js";
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
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => () => Promise.resolve({ ok: true }),
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (fn: (opts?: unknown) => unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("cloudflare:workers", () => ({
  env: {},
}));

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const OPERATION_ID = HIGH_ASSURANCE_CHALLENGE_FIXTURE.id;
const DETAIL_PATH = `/orgs/${ORG_ID}/approvals/${OPERATION_ID}`;

const CHALLENGE_DETAIL_ENVELOPE = {
  operationId: OPERATION_ID,
  intentCode: HIGH_ASSURANCE_CHALLENGE_FIXTURE.intentCode,
  challengeId: "challenge-001",
  projectId: HIGH_ASSURANCE_CHALLENGE_FIXTURE.projectId,
  environmentId: HIGH_ASSURANCE_CHALLENGE_FIXTURE.environmentId,
  riskReasonCode: HIGH_ASSURANCE_CHALLENGE_FIXTURE.riskReasonCode,
  requestedAt: HIGH_ASSURANCE_CHALLENGE_FIXTURE.requestedAt,
  expiresAt: HIGH_ASSURANCE_CHALLENGE_FIXTURE.expiresAt,
  requestingMachineIdentityId: HIGH_ASSURANCE_CHALLENGE_FIXTURE.requestingMachineIdentityId,
  status: "pending",
  hasClearedEvidence: false,
};

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(DETAIL_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("approval detail read over the BFF seam", () => {
  it("reads one challenge's metadata evidence for an authorized member", async () => {
    const { client, calls } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/high-assurance-challenges/${OPERATION_ID}`]: () =>
        Response.json({
          ok: true,
          data: { challenge: CHALLENGE_DETAIL_ENVELOPE },
        }),
    });

    const parsed = parseOrgHighAssuranceChallengeDetailBody(
      await client.orgHighAssuranceChallenge(ORG_ID, OPERATION_ID),
    );

    expect(parsed?.status).toBe("pending");
    expect(parsed?.challengeId).toBe("challenge-001");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
  });

  it("routes an unauthenticated deep link through login with returnTo", async () => {
    const resolved = await resolveBrowserActor(ssrRequest(DETAIL_PATH), createFakeWebEnv());
    expect(resolved.ok).toBe(false);
    expect(loginRedirectHref(DETAIL_PATH)).toBe(
      `/login?returnTo=${encodeURIComponent(DETAIL_PATH)}`,
    );
  });
});

describe("approval detail render", () => {
  const detail = {
    ...HIGH_ASSURANCE_CHALLENGE_FIXTURE,
    challengeId: "challenge-001",
    status: "pending" as const,
    hasClearedEvidence: false,
  };

  it("renders metadata evidence, reject affordance, and unsupported Approval Request state", () => {
    const evidence = renderToStaticMarkup(
      <HighAssuranceChallengeEvidencePanel challenge={detail} />,
    );
    expect(evidence).toContain("Evidence");
    expect(evidence).toContain(detail.intentCode);
    expect(evidence).toContain(detail.requestingMachineIdentityId ?? "");
    expect(evidence).not.toContain("Approve");

    const reject = renderToStaticMarkup(
      <RejectChallengePanel orgId={ORG_ID} operationId={OPERATION_ID} disabled={false} />,
    );
    expect(reject).toContain("Reject challenge");
    expect(reject).toContain("Optional reason");

    const unsupported = renderToStaticMarkup(<ApprovalRequestUnsupportedPanel orgId={ORG_ID} />);
    expect(unsupported).toContain("Not yet supported");
  });
});

describe("approval detail deny over the BFF seam", () => {
  it("posts deny for a pending challenge", async () => {
    const { client, calls } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/high-assurance-challenges/${OPERATION_ID}/deny`]: () =>
        Response.json({
          ok: true,
          data: {
            operationId: OPERATION_ID,
            challengeId: "challenge-001",
            state: "canceled",
          },
        }),
    });

    const body = await client.denyOrgHighAssuranceChallenge(ORG_ID, OPERATION_ID);
    expect(body).toMatchObject({ ok: true, data: { state: "canceled" } });
    expect(calls[0]?.url.pathname).toBe(
      `/v1/orgs/${ORG_ID}/high-assurance-challenges/${OPERATION_ID}/deny`,
    );
  });
});
