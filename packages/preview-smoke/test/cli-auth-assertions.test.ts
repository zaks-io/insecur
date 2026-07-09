import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertCliAuthFailure,
  assertCliConfigShowSuccess,
  assertCliLogoutSuccess,
  assertCliNavigationListSuccess,
  assertCliWhoamiSuccess,
  CLI_AUTH_REQUIRED_EXIT_CODE,
} from "../src/cli-auth-assertions";

const preview = {
  apiBaseUrl: "https://api.preview.example",
  databaseUrl: "postgres://user:pass@localhost/db",
  expectedSha: "a".repeat(40),
  inviteeUserId: "usr_invitee",
  inviteeWorkosUserId: "user_invitee",
  noScopeUserId: "usr_noscope",
  noScopeWorkosUserId: "user_noscope",
  ownerUserId: "usr_owner",
  ownerWorkosUserId: "user_owner",
  signingSecret: "signing-secret",
  siteBaseUrl: "https://site.preview.example",
  webBaseUrl: "https://app.preview.example",
};

describe("cli auth assertions", () => {
  it("accepts metadata-only whoami success", () => {
    const data = assertCliWhoamiSuccess(
      {
        ok: true,
        data: {
          actorType: "user",
          userId: preview.ownerUserId,
          sessionId: "sess_test",
          sessionValid: true,
          sessionExpiresAt: "2026-08-01T00:00:00.000Z",
          resolvedContext: {
            organizationId: "org_test",
            projectId: "prj_test",
            environmentId: "env_test",
          },
          attribution: { tier: "none" },
        },
      },
      preview,
      {
        organizationId: "org_test",
        projectId: "prj_test",
        environmentId: "env_test",
      },
    );

    expect(data).toMatchObject({
      actorType: "user",
      userId: preview.ownerUserId,
      sessionValid: true,
      resolvedContext: {
        organizationId: "org_test",
        projectId: "prj_test",
        environmentId: "env_test",
      },
    });
  });

  it("accepts navigation list envelopes", () => {
    const body = {
      ok: true,
      data: {
        organizations: [{ organizationId: "org_test", displayName: "Workspace" }],
      },
    };
    const organizations = assertCliNavigationListSuccess(body, "CLI orgs list", "organizations");
    expect(organizations).toHaveLength(1);
  });

  it("accepts config show with resolved scope", () => {
    const data = assertCliConfigShowSuccess(
      {
        ok: true,
        data: {
          host: preview.apiBaseUrl,
          orgId: "org_test",
          projectId: "prj_test",
          envId: "env_test",
          projectConfigPath: "/tmp/project/insecur.json",
          branchEnv: {},
          profiles: [
            {
              profileId: "prof_test",
              slug: "local-dev",
              displayName: "Local development",
              host: preview.apiBaseUrl,
              orgId: "org_test",
              projectId: "prj_test",
              envId: "env_test",
            },
          ],
        },
      },
      "CLI config show",
      {
        host: preview.apiBaseUrl,
        organizationId: "org_test",
        projectId: "prj_test",
        environmentId: "env_test",
      },
    );

    expect(data.profiles).toEqual([
      expect.objectContaining({
        profileId: "prof_test",
        slug: "local-dev",
        host: preview.apiBaseUrl,
      }),
    ]);
  });

  it("accepts logout success", () => {
    assertCliLogoutSuccess(
      {
        ok: true,
        data: {
          revoked: true,
          removed: true,
          revokeAttempted: true,
        },
      },
      "CLI logout",
    );
  });

  it("rejects logout envelopes that did not revoke the session", () => {
    expect(() => {
      assertCliLogoutSuccess(
        {
          ok: true,
          data: {
            revoked: false,
            removed: true,
            revokeAttempted: true,
          },
        },
        "CLI logout",
      );
    }).toThrow(/CLI logout revoked/);
  });

  it("accepts auth.invalid failure envelopes on stderr", () => {
    assertCliAuthFailure({
      exitCode: CLI_AUTH_REQUIRED_EXIT_CODE,
      label: "CLI whoami after logout",
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {
          code: AUTH_ERROR_CODES.invalid,
          message: "Session is no longer valid.",
          retryable: false,
        },
        remediation: { login: ["insecur", "login", "--shell"] },
      }),
    });
  });

  it("accepts auth failure stderr with runtime warnings before JSON", () => {
    assertCliAuthFailure({
      exitCode: CLI_AUTH_REQUIRED_EXIT_CODE,
      label: "CLI whoami after logout",
      stdout: "",
      stderr: [
        "(node:1) ExperimentalWarning: SQLite is an experimental feature",
        JSON.stringify({
          ok: false,
          error: {
            code: AUTH_ERROR_CODES.invalid,
            message: "Session is no longer valid.",
            retryable: false,
          },
        }),
      ].join("\n"),
    });
  });

  it("rejects auth failure output that leaks forbidden remediation fields", () => {
    expect(() => {
      assertCliAuthFailure({
        exitCode: CLI_AUTH_REQUIRED_EXIT_CODE,
        label: "CLI whoami after logout",
        stdout: "",
        stderr: JSON.stringify({
          ok: false,
          error: {
            code: AUTH_ERROR_CODES.invalid,
            message: "Session is no longer valid.",
            retryable: false,
          },
          remediation: { token: "must-not-appear" },
        }),
      });
    }).toThrow(/forbidden key: token/);
  });

  it("rejects auth failures with the wrong exit code", () => {
    expect(() => {
      assertCliAuthFailure({
        exitCode: 1,
        label: "CLI whoami after logout",
        stdout: "",
        stderr: JSON.stringify({
          ok: false,
          error: {
            code: AUTH_ERROR_CODES.invalid,
            message: "Session is no longer valid.",
            retryable: false,
          },
        }),
      });
    }).toThrow(/expected exit code 3/);
  });
});
