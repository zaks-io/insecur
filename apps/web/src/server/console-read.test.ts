import { describe, expect, it, vi } from "vitest";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import { parseOrgProjectsBody } from "../console/projects.js";
import type { BffApiClient } from "./bff-api.js";
import {
  collapseConsoleEnvelopeParses,
  consoleRead,
  consoleReadUnavailable,
  envelopeParseToReadResult,
  runConsoleReadSteps,
} from "./console-read.js";

const resolveMock = vi.hoisted(() => ({ resolveAuthenticatedApiClient: vi.fn() }));

vi.mock("./bff-api.js", () => resolveMock);

// A resolved client whose `api` the read closure never actually calls in these tests: the read is
// the fake, so the api surface is irrelevant. Cast keeps the seam honest without a full stub.
const FAKE_CLIENT = { api: {} as BffApiClient, actor: {} } as Awaited<
  ReturnType<typeof resolveMock.resolveAuthenticatedApiClient>
>;

describe("consoleRead fail-closed contract", () => {
  it("maps an unresolved session to unauthenticated without calling the read", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(null);
    const read = vi.fn();

    const result = await consoleRead(read);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(read).not.toHaveBeenCalled();
  });

  it("maps a null value to a metadata-safe denial", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => null);

    expect(result).toEqual({ kind: "denied" });
  });

  it("carries a non-null value through as ok", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => ({ projects: [] }));

    expect(result).toEqual({ kind: "ok", value: { projects: [] } });
  });

  it("maps a transport rejection to unavailable instead of throwing a loader error", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => {
      throw new TypeError("network error: fetch failed");
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("maps a JSON-parse rejection (non-JSON 5xx body) to unavailable, never a 500", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => {
      // Stand-in for `await response.json()` throwing on an HTML 5xx error page.
      JSON.parse("<html>502 Bad Gateway</html>");
      return { unreached: true };
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("maps a structured non-auth API error envelope to unavailable", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);
    const body = { ok: false, error: { code: "store.runtime_config_missing" } };

    const result = await consoleRead(async () =>
      envelopeParseToReadResult(parseConsoleReadEnvelope(body, parseOrgProjectsBody)),
    );

    expect(result).toEqual({ kind: "unavailable" });
  });
});

describe("collapseConsoleEnvelopeParses", () => {
  it("returns unavailable when any composed parse is unavailable", () => {
    const result = collapseConsoleEnvelopeParses(
      [{ kind: "ok", value: ["member"] }, { kind: "unavailable" }],
      (members, invitations) => ({ members, invitations }),
    );

    expect(result).toBe(consoleReadUnavailable);
  });

  it("returns denied when any composed parse is denied and none are unavailable", () => {
    const result = collapseConsoleEnvelopeParses(
      [{ kind: "ok", value: ["member"] }, { kind: "denied" }],
      (members, invitations) => ({ members, invitations }),
    );

    expect(result).toBeNull();
  });

  it("combines values when every composed parse is ok", () => {
    const result = collapseConsoleEnvelopeParses(
      [
        { kind: "ok", value: ["member"] },
        { kind: "ok", value: ["invite"] },
      ],
      (members, invitations) => ({ members, invitations }),
    );

    expect(result).toEqual({ members: ["member"], invitations: ["invite"] });
  });
});

describe("runConsoleReadSteps multi-call adapter", () => {
  const orgMembersFetch = (api: BffApiClient) => api.orgMembers("org-1");
  const orgInvitationsFetch = (api: BffApiClient) => api.orgInvitations("org-1");
  const emptyListParse = (): readonly unknown[] => [];
  const nullParse = (): null => null;
  const combinePeople = (
    members: readonly unknown[],
    invitations: readonly unknown[],
  ): { members: readonly unknown[]; invitations: readonly unknown[] } => ({ members, invitations });

  const peopleReadSteps = [
    { fetch: orgMembersFetch, parse: emptyListParse },
    { fetch: orgInvitationsFetch, parse: nullParse },
  ] as const;

  const successfulPeopleReadSteps = [
    { fetch: orgMembersFetch, parse: emptyListParse },
    { fetch: orgInvitationsFetch, parse: emptyListParse },
  ] as const;

  it("maps one unavailable call to unavailable", async () => {
    const api = {
      orgMembers: vi.fn().mockResolvedValue({ ok: true, data: { members: [] } }),
      orgInvitations: vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: "store.runtime_config_missing" } }),
    } as unknown as BffApiClient;

    const result = await runConsoleReadSteps(api, peopleReadSteps, combinePeople);

    expect(result).toBe(consoleReadUnavailable);
  });

  it("maps one denied call to denied", async () => {
    const api = {
      orgMembers: vi.fn().mockResolvedValue({ ok: true, data: { members: [] } }),
      orgInvitations: vi.fn().mockResolvedValue({ not: "an envelope" }),
    } as unknown as BffApiClient;

    const result = await runConsoleReadSteps(api, peopleReadSteps, combinePeople);

    expect(result).toBeNull();
  });

  it("returns combined metadata when every composed call succeeds", async () => {
    const api = {
      orgMembers: vi.fn().mockResolvedValue({ ok: true, data: { members: [] } }),
      orgInvitations: vi.fn().mockResolvedValue({ ok: true, data: { invitations: [] } }),
    } as unknown as BffApiClient;

    const result = await runConsoleReadSteps(api, successfulPeopleReadSteps, combinePeople);

    expect(result).toEqual({ members: [], invitations: [] });
  });
});
