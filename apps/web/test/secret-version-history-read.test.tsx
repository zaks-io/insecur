import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { SecretVersionHistoryTable } from "../src/components/secrets/secret-version-history.js";
import { parseSecretVersionsBody } from "../src/console/secret-versions.js";
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

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const PROJECT_ID = "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const ENV_ID = "env_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const SECRET_ID = "sec_01JZ8E2QYQAAAAAAAAAAAAAAAA";

const VERSION_HISTORY_BODY = {
  ok: true,
  data: {
    secretId: SECRET_ID,
    variableKey: "DATABASE_URL",
    versions: [
      {
        secretVersionId: "sv_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        versionNumber: 2,
        lifecycleState: "live",
        createdAt: "2026-07-01T00:00:00.000Z",
        publishedAt: "2026-07-01T00:00:00.000Z",
        isCurrent: true,
        isPublished: true,
        setAt: "2026-07-01T00:00:00.000Z",
        setActor: {
          actorType: "user",
          userId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
          details: {
            agentSessionId: "ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
            harnessName: "agent.harness.cursor",
          },
        },
      },
      {
        secretVersionId: "sv_01JZ8E2QYQBBBBBBBBBBBBBBBB",
        versionNumber: 1,
        lifecycleState: "retained",
        createdAt: "2026-06-01T00:00:00.000Z",
        publishedAt: "2026-06-01T00:00:00.000Z",
        isCurrent: false,
        isPublished: false,
        setAt: "2026-06-01T00:00:00.000Z",
        setActor: {
          actorType: "machine",
          machineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
          details: { githubRunId: "run_123" },
        },
      },
    ],
  },
};

function assertNoValueShapedFields(html: string): void {
  expect(html).not.toMatch(/ciphertext|valueUtf8|plaintext|password|wrapped/i);
}

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(`/orgs/${ORG_ID}`, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("secret version history read over the BFF seam", () => {
  it("parses metadata-only version history with principal-chain actors", async () => {
    const versionsPath = `/v1/orgs/${ORG_ID}/projects/${PROJECT_ID}/environments/${ENV_ID}/secrets/${SECRET_ID}/versions`;
    const { client } = await authedApiClient({
      [versionsPath]: () => new Response(JSON.stringify(VERSION_HISTORY_BODY)),
    });

    const parsed = parseSecretVersionsBody(
      await client.secretVersions(ORG_ID, PROJECT_ID, ENV_ID, SECRET_ID),
    );
    expect(parsed?.versions).toHaveLength(2);
    expect(parsed?.versions[0]?.setActor).toMatchObject({
      actorType: "user",
      details: { agentSessionId: "ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E" },
    });
    expect(parsed?.versions[1]?.setActor).toMatchObject({
      actorType: "machine",
      details: { githubRunId: "run_123" },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/ciphertext|valueUtf8|plaintext|password/i);
  });

  it("fails closed on denied reads", async () => {
    const versionsPath = `/v1/orgs/${ORG_ID}/projects/${PROJECT_ID}/environments/${ENV_ID}/secrets/${SECRET_ID}/versions`;
    const { client } = await authedApiClient({
      [versionsPath]: () =>
        new Response(JSON.stringify({ ok: false, error: { code: "auth.insufficient_scope" } })),
    });

    expect(
      parseSecretVersionsBody(await client.secretVersions(ORG_ID, PROJECT_ID, ENV_ID, SECRET_ID)),
    ).toBeNull();
  });
});

describe("SecretVersionHistoryTable render", () => {
  it("renders principal-chain actor labels without value-shaped fields", () => {
    const parsed = parseSecretVersionsBody(VERSION_HISTORY_BODY);
    if (!parsed) {
      throw new Error("expected version history fixture to parse");
    }
    const html = renderToStaticMarkup(<SecretVersionHistoryTable versions={parsed.versions} />);

    expect(html).toContain("agent ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E (cursor)");
    expect(html).toContain("run_123 · mach_01JZ8E2QYQAAAAAAAAAAAAAAAA");
    expect(html).toContain("Current");
    assertNoValueShapedFields(html);
  });
});
