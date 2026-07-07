import { afterEach, describe, expect, it, vi } from "vitest";
import { organizationId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { createHttpApiClientForHost } from "../src/api/http-client.js";
import { runAuditExportCommand } from "../src/commands/audit-export.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { CliError } from "../src/output/cli-error.js";

const ORG = organizationId.brand("org_00000000000000000000000011");

const exportBundle = {
  jsonl: '{"schema_version":"1"}\n',
  manifest: {
    schema_version: "1",
    organization_id: ORG,
    time_range: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z",
    },
    entry_count: 1,
    first_hash: "hash",
    last_hash: "hash",
    hash_algorithm: "SHA-256",
    hmac_key_version: 1,
    signing_key_version: 1,
    hmac: "hmac",
    signature: "signature",
    signature_algorithm: "Ed25519",
    custody_evidence_refs: {
      hmac: "escrow-record://instance/test/audit-hmac/v1",
      signing: "escrow-record://instance/test/audit-signing/v1",
    },
  },
};

function makeContext(): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host: "https://insecur.test",
      orgId: ORG,
      projectId: undefined,
      envId: undefined,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

describe("audit export CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.INSECUR_SESSION_TOKEN;
  });

  it("calls the tenant-scoped audit-export route with the requested time range", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: exportBundle }), { status: 200 }),
      );

    const exitCode = await runAuditExportCommand(
      { json: true, quiet: true, verbose: false, orgId: ORG },
      createHttpApiClientForHost("https://insecur.test"),
      makeContext(),
      {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
      },
    );

    expect(exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe(`/v1/orgs/${ORG}/audit-export`);
    expect(parsed.searchParams.get("from")).toBe("2026-07-01T00:00:00.000Z");
    expect(parsed.searchParams.get("to")).toBe("2026-07-02T00:00:00.000Z");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("rejects an invalid from timestamp before calling the API", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      runAuditExportCommand(
        { json: true, quiet: true, verbose: false, orgId: ORG },
        createHttpApiClientForHost("https://insecur.test"),
        makeContext(),
        { from: "not-a-date", to: "2026-07-02T00:00:00.000Z" },
      ),
    ).rejects.toMatchObject({
      name: "CliError",
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Invalid audit export from timestamp.",
    } satisfies Partial<CliError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
