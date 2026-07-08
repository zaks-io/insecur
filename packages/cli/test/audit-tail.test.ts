import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_EVENTS_MAX_PAGE_SIZE } from "@insecur/audit";
import { auditEventId, organizationId, userId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../src/output/cli-error.js";
import { createHttpApiClientForHost } from "../src/api/http-client.js";
import { runAuditTailCommand } from "../src/commands/audit-tail.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";

const ORG = organizationId.brand("org_00000000000000000000000011");
const OTHER_ORG = organizationId.brand("org_00000000000000000000000099");

const metadataOnlyAuditEvent = {
  auditEventId: auditEventId.brand("aud_00000000000000000000000011"),
  organizationId: ORG,
  eventCode: "secret.non_protected_write",
  outcome: "success" as const,
  resultCode: "audit.succeeded",
  actor: {
    actorType: "user" as const,
    userId: userId.brand("usr_00000000000000000000000011"),
  },
  projectId: null,
  environmentId: null,
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: {
    agentSessionId: "ags_00000000000000000000000011",
    harnessName: "agent.harness.claude_code",
  },
  createdAt: "2026-07-01T00:00:00.000Z",
};

function makeContext(orgId = ORG): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host: "https://insecur.test",
      orgId,
      projectId: undefined,
      envId: undefined,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

describe("audit tail CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.INSECUR_SESSION_TOKEN;
  });

  it("calls the tenant-scoped audit-events route for the resolved organization", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { events: [metadataOnlyAuditEvent], nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    const exitCode = await runAuditTailCommand(
      { json: true, quiet: true, verbose: false, orgId: ORG },
      createHttpApiClientForHost("https://insecur.test"),
      makeContext(),
      { limit: "10", from: "2026-07-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/v1/orgs/org_00000000000000000000000011/audit-events");
    expect(parsed.searchParams.get("pageSize")).toBe("10");
    expect(parsed.searchParams.get("createdAtFrom")).toBe("2026-07-01T00:00:00.000Z");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer bearer_test",
    });
  });

  it("does not request audit events for a different organization id in the path", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { events: [], nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    await runAuditTailCommand(
      {
        json: true,
        quiet: true,
        verbose: false,
        host: undefined,
        orgId: undefined,
        projectId: undefined,
        envId: undefined,
        profile: undefined,
        profileId: undefined,
        configDir: undefined,
      },
      createHttpApiClientForHost("https://insecur.test"),
      makeContext(OTHER_ORG),
      {},
    );

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(requestedUrl).toContain(`/v1/orgs/${OTHER_ORG}/audit-events`);
    expect(requestedUrl).not.toContain(ORG);
  });

  it("returns metadata-only JSON without Sensitive Values", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { events: [metadataOnlyAuditEvent], nextCursor: "cursor_next" },
        }),
        { status: 200 },
      ),
    );

    await runAuditTailCommand(
      { json: true, quiet: false, verbose: false, orgId: ORG },
      createHttpApiClientForHost("https://insecur.test"),
      makeContext(),
      {},
    );

    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("secret.non_protected_write");
    expect(output).not.toMatch(/valueUtf8|plaintext|password|secret-value/i);
    expect(output).not.toContain("super-secret-value-must-not-appear");
  });

  it("rejects --limit above the API page size cap", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      runAuditTailCommand(
        { json: true, quiet: true, verbose: false, orgId: ORG },
        createHttpApiClientForHost("https://insecur.test"),
        makeContext(),
        { limit: String(AUDIT_EVENTS_MAX_PAGE_SIZE + 1) },
      ),
    ).rejects.toMatchObject({
      name: "CliError",
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `Invalid audit tail limit. Use an integer from 1 to ${String(AUDIT_EVENTS_MAX_PAGE_SIZE)}.`,
    } satisfies Partial<CliError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed timestamp filters before requesting audit events", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      runAuditTailCommand(
        { json: true, quiet: true, verbose: false, orgId: ORG },
        createHttpApiClientForHost("https://insecur.test"),
        makeContext(),
        { from: "not-a-date" },
      ),
    ).rejects.toMatchObject({
      name: "CliError",
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Invalid audit tail --from timestamp. Use YYYY-MM-DD or a UTC ISO 8601 timestamp.",
    } satisfies Partial<CliError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns metadata-only human output without Sensitive Values", async () => {
    process.env.INSECUR_SESSION_TOKEN = "bearer_test";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { events: [metadataOnlyAuditEvent], nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    await runAuditTailCommand(
      { json: false, quiet: false, verbose: false, orgId: ORG },
      createHttpApiClientForHost("https://insecur.test"),
      makeContext(),
      {},
    );

    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("secret.non_protected_write");
    expect(output).not.toMatch(/valueUtf8|plaintext|password|secret-value/i);
  });
});
