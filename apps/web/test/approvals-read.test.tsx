import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { parseOrgHighAssuranceChallengesBody } from "../src/console/approval-items.js";
import { ApprovalItem } from "../src/components/approval-item.js";
import { NeedsYouStripContent } from "../src/components/needs-you-strip-content.js";
import { ApprovalsInboxContent } from "../src/components/pending-approvals-inbox-content.js";
import {
  APPROVAL_REQUEST_FIXTURE,
  HIGH_ASSURANCE_CHALLENGE_FIXTURE,
} from "../src/components/approval-item.test.js";
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

// Approvals read over the INS-369 harness: session cookie -> Runtime admission ->
// scoped-token API hop -> high-assurance-challenges parse, exactly the seam Home and the approvals
// inbox compose through loadOrgPendingApprovals.
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

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const APPROVALS_PATH = `/orgs/${ORG_ID}/approvals`;

const CHALLENGE_ENVELOPE = {
  operationId: HIGH_ASSURANCE_CHALLENGE_FIXTURE.id,
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
    ssrRequest(APPROVALS_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("approvals read over the BFF seam", () => {
  it("reads pending High-Assurance Challenge metadata for an authorized member", async () => {
    const { client, calls } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/high-assurance-challenges`]: () =>
        Response.json({
          ok: true,
          data: { challenges: [CHALLENGE_ENVELOPE] },
        }),
    });

    const parsed = parseOrgHighAssuranceChallengesBody(
      await client.orgHighAssuranceChallenges(ORG_ID),
    );

    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toEqual(HIGH_ASSURANCE_CHALLENGE_FIXTURE);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
  });

  it("fails closed on a non-member denial: the error envelope parses to null, like nonexistence", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/high-assurance-challenges`]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
    });

    expect(
      parseOrgHighAssuranceChallengesBody(await client.orgHighAssuranceChallenges(ORG_ID)),
    ).toBe(null);
  });

  it("parses an empty inbox as a valid authorized read (the empty-state render path)", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/high-assurance-challenges`]: () =>
        Response.json({ ok: true, data: { challenges: [] } }),
    });

    expect(
      parseOrgHighAssuranceChallengesBody(await client.orgHighAssuranceChallenges(ORG_ID)),
    ).toEqual({ items: [] });
  });
});

describe("approvals surface render", () => {
  it("renders the Home strip and inbox empty states plus both inbox item kinds", () => {
    const stripEmpty = renderToStaticMarkup(<NeedsYouStripContent orgId={ORG_ID} items={[]} />);
    expect(stripEmpty).toContain('aria-label="Needs you"');
    expect(stripEmpty).toContain("Nothing needs you");

    const stripPending = renderToStaticMarkup(
      <NeedsYouStripContent orgId={ORG_ID} items={[HIGH_ASSURANCE_CHALLENGE_FIXTURE]} />,
    );
    expect(stripPending).toContain("1 item");
    expect(stripPending).toContain(HIGH_ASSURANCE_CHALLENGE_FIXTURE.id);
    expect(stripPending).toContain(`/orgs/${ORG_ID}/approvals`);

    const inboxEmpty = renderToStaticMarkup(<ApprovalsInboxContent orgId={ORG_ID} items={[]} />);
    expect(inboxEmpty).toContain("Nothing needs you");

    const hacRow = renderToStaticMarkup(<ApprovalItem item={HIGH_ASSURANCE_CHALLENGE_FIXTURE} />);
    const requestRow = renderToStaticMarkup(<ApprovalItem item={APPROVAL_REQUEST_FIXTURE} />);
    expect(hacRow).toContain("High-Assurance Challenge");
    expect(requestRow).toContain("Approval Request");
  });
});
