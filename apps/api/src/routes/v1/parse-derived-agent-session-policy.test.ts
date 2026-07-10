import { describe, expect, it } from "vitest";
import { parseDerivedAgentSessionPolicy } from "./parse-derived-agent-session-policy.js";

describe("parseDerivedAgentSessionPolicy", () => {
  it("accepts canonical scopes, resource bounds, and TTL", () => {
    expect(
      parseDerivedAgentSessionPolicy({
        credentialScopes: ["secret:read"],
        organizationId: "org_00000000000000000000000001",
        projectId: "prj_00000000000000000000000001",
        environmentId: "env_00000000000000000000000001",
        ttlSeconds: 600,
      }),
    ).toMatchObject({
      credentialScopes: ["secret:read"],
      organizationId: "org_00000000000000000000000001",
      projectId: "prj_00000000000000000000000001",
      environmentId: "env_00000000000000000000000001",
      ttlSeconds: 600,
    });
  });

  it("rejects unknown scopes and malformed resource boundaries", () => {
    expect(() => parseDerivedAgentSessionPolicy({ credentialScopes: ["root:everything"] })).toThrow(
      "unknown authorization scope",
    );
    expect(() => parseDerivedAgentSessionPolicy({ projectId: "not-a-project" })).toThrow(
      "Invalid projectId",
    );
    expect(() =>
      parseDerivedAgentSessionPolicy({ projectId: "prj_00000000000000000000000001" }),
    ).toThrow("projectId requires organizationId");
    expect(() =>
      parseDerivedAgentSessionPolicy({ environmentId: "env_00000000000000000000000001" }),
    ).toThrow("environmentId requires projectId");
  });
});
