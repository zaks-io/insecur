import { describe, expect, it } from "vitest";
import {
  defaultOrgPath,
  findConsoleOrganization,
  parseSessionMembershipsBody,
} from "./organizations.js";

const organizations = [
  { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" },
  { organizationId: "org_00000000000000000000000002", displayName: "Beta LLC" },
];

describe("parseSessionMembershipsBody", () => {
  it("parses the success envelope into console organizations", () => {
    expect(parseSessionMembershipsBody({ ok: true, data: { organizations } })).toEqual(
      organizations,
    );
  });

  it("parses an empty membership set", () => {
    expect(parseSessionMembershipsBody({ ok: true, data: { organizations: [] } })).toEqual([]);
  });

  it.each([
    null,
    "nope",
    { ok: false, error: { code: "auth.required" } },
    { ok: true, data: {} },
    { ok: true, data: { organizations: [{ organizationId: 7, displayName: "x" }] } },
    { ok: true, data: { organizations: [{ organizationId: "org_1" }] } },
  ])("fails closed on a malformed body: %j", (body) => {
    expect(parseSessionMembershipsBody(body)).toBeNull();
  });
});

describe("defaultOrgPath", () => {
  it("resolves the first organization as the default", () => {
    expect(defaultOrgPath(organizations)).toBe("/orgs/org_00000000000000000000000001");
  });

  it("sends org-less members to onboarding", () => {
    expect(defaultOrgPath([])).toBe("/onboarding");
  });

  it("percent-encodes the opaque org id at the path boundary", () => {
    // The org id is opaque: it must not be spliced into the URL raw. A value with a reserved
    // character stays inside one path segment instead of injecting a query or extra segment.
    expect(defaultOrgPath([{ organizationId: "org_a/b?c#d", displayName: "Edge Co" }])).toBe(
      "/orgs/org_a%2Fb%3Fc%23d",
    );
  });
});

describe("findConsoleOrganization", () => {
  it("finds the active organization by opaque id", () => {
    expect(
      findConsoleOrganization(organizations, "org_00000000000000000000000002")?.displayName,
    ).toBe("Beta LLC");
  });

  it("returns undefined for a non-member org id", () => {
    expect(
      findConsoleOrganization(organizations, "org_00000000000000000000000099"),
    ).toBeUndefined();
  });
});
