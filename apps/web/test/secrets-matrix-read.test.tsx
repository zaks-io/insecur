import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { SecretsMatrixTable } from "../src/components/secrets/secrets-matrix-table.js";
import type { ConsoleEnvironment } from "../src/console/projects.js";
import {
  parseProjectSecretsBody,
  secretMatrixRowHasDrift,
  type ConsoleSecretMatrixRow,
} from "../src/console/secrets-matrix.js";
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

// Project secrets matrix read over the INS-375 harness: session cookie -> Runtime admission ->
// scoped-token API hop -> matrix parse, exactly the seam the /orgs/.../secrets loader composes
// through loadProjectSecrets.
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
const PROJECT_ID = "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H";
const SECRETS_PATH = `/orgs/${ORG_ID}/projects/${PROJECT_ID}/secrets`;
const API_SECRETS_PATH = `/v1/orgs/${ORG_ID}/projects/${PROJECT_ID}/secrets`;

const ENV_STAGING: ConsoleEnvironment = {
  environmentId: "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
  displayName: "staging",
  lifecycleStage: "staging",
  isProtected: false,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const ENV_PRODUCTION: ConsoleEnvironment = {
  environmentId: "env_01JZ8E5R2P7M9N3K5T8V1X6Z0B",
  displayName: "production",
  lifecycleStage: "production",
  isProtected: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const DRIFT_ROWS: readonly ConsoleSecretMatrixRow[] = [
  {
    variableKey: "DATABASE_URL",
    cells: [
      {
        environmentId: ENV_STAGING.environmentId,
        present: true,
        secretId: "sec_00000000000000000000000001",
        versionNumber: 1,
        secretVersionId: "sv_00000000000000000000000001",
        lifecycleState: "live",
        lastSetAt: "2026-06-24T01:00:00.000Z",
        lastSetActor: { actorType: "user", userId: "usr_00000000000000000000000011" },
      },
      {
        environmentId: ENV_PRODUCTION.environmentId,
        present: true,
        secretId: "sec_00000000000000000000000002",
        versionNumber: 3,
        secretVersionId: "sv_00000000000000000000000002",
        lifecycleState: "live",
        lastSetAt: "2026-06-25T01:00:00.000Z",
        lastSetActor: { actorType: "user", userId: "usr_00000000000000000000000011" },
      },
    ],
  },
];

const DRIFT_MATRIX = {
  environments: [ENV_STAGING, ENV_PRODUCTION] as const,
  rows: DRIFT_ROWS,
};

const FORBIDDEN_VALUE_FIELDS = [
  "value",
  "ciphertext",
  "plaintext",
  "password",
  "valueUtf8",
  "secretValue",
] as const;

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(SECRETS_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

function assertNoValueShapedFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const field of FORBIDDEN_VALUE_FIELDS) {
    expect(serialized).not.toContain(`"${field}"`);
  }
}

describe("project secrets matrix read over the BFF seam", () => {
  it("reads matrix metadata for an authorized member", async () => {
    const { client, calls } = await authedApiClient({
      [API_SECRETS_PATH]: () => Response.json({ ok: true, data: DRIFT_MATRIX }),
    });

    const parsed = parseProjectSecretsBody(await client.projectSecrets(ORG_ID, PROJECT_ID));

    expect(parsed).toEqual(DRIFT_MATRIX);
    const firstRow = parsed?.rows[0];
    expect(firstRow).toBeDefined();
    if (firstRow !== undefined) {
      expect(secretMatrixRowHasDrift(firstRow)).toBe(true);
    }
    assertNoValueShapedFields(parsed);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
  });

  it("parses an empty project matrix as a valid authorized read", async () => {
    const { client } = await authedApiClient({
      [API_SECRETS_PATH]: () =>
        Response.json({
          ok: true,
          data: { environments: [ENV_STAGING], rows: [] },
        }),
    });

    expect(parseProjectSecretsBody(await client.projectSecrets(ORG_ID, PROJECT_ID))).toEqual({
      environments: [ENV_STAGING],
      rows: [],
    });
  });

  it("fails closed on a non-member denial", async () => {
    const { client } = await authedApiClient({
      [API_SECRETS_PATH]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
    });

    expect(parseProjectSecretsBody(await client.projectSecrets(ORG_ID, PROJECT_ID))).toBeNull();
  });
});

describe("SecretsMatrixTable render", () => {
  it("renders drift, protected columns, and metadata-only cells", () => {
    const html = renderToStaticMarkup(
      <SecretsMatrixTable environments={DRIFT_MATRIX.environments} rows={DRIFT_MATRIX.rows} />,
    );

    expect(html).toContain("DATABASE_URL");
    expect(html).toContain("Drift");
    expect(html).toContain("Protected");
    expect(html).toContain("v1");
    expect(html).toContain("v3");
    expect(html).toContain('data-drift="true"');
    assertNoValueShapedFields(html);
  });

  it("renders an empty matrix body when there are no secret rows", () => {
    const html = renderToStaticMarkup(
      <SecretsMatrixTable environments={[ENV_STAGING]} rows={[]} />,
    );
    expect(html).toContain("staging");
    expect(html).not.toContain("Drift");
  });
});

describe("formatSecretMatrixLastSetActorLabel", () => {
  it("formats user actors with opaque ids", async () => {
    const { formatSecretMatrixLastSetActorLabel } =
      await import("../src/console/secrets-matrix-actor.js");
    expect(
      formatSecretMatrixLastSetActorLabel({
        actorType: "user",
        userId: "usr_00000000000000000000000011",
      }),
    ).toBe("usr_00000000000000000000000011");
  });
});
