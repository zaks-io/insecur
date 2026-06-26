import { CREDENTIAL_SCOPES } from "@insecur/access";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { loadActiveGitHubActionsOidcAuthMethods } from "../src/load-github-actions-oidc-auth-methods.js";
import { createFakeTenantSql } from "../../operations/test/helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000001");

describe("loadActiveGitHubActionsOidcAuthMethods", () => {
  it("maps active auth method rows into branded domain identifiers", async () => {
    const sql = createFakeTenantSql((_query, values) => {
      expect(values[0]).toBe(ORG);
      return [
        {
          id: AUTH_METHOD,
          org_id: ORG,
          machine_identity_id: MACHINE,
          project_id: PROJECT,
          environment_id: ENV,
          github_repository: "insecur-ci/example",
          github_environment: "production",
          oidc_audience: "insecur://oidc/github-actions",
          credential_scopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
          status: "active",
        },
      ];
    });

    const rows = await loadActiveGitHubActionsOidcAuthMethods(sql, ORG);
    expect(rows).toEqual([
      {
        id: AUTH_METHOD,
        organizationId: ORG,
        machineIdentityId: MACHINE,
        projectId: PROJECT,
        environmentId: ENV,
        githubRepository: "insecur-ci/example",
        githubEnvironment: "production",
        oidcAudience: "insecur://oidc/github-actions",
        credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
        status: "active",
      },
    ]);
  });

  it("drops rows with invalid credential scopes or unknown status values", async () => {
    const sql = createFakeTenantSql(() => [
      {
        id: AUTH_METHOD,
        org_id: ORG,
        machine_identity_id: MACHINE,
        project_id: PROJECT,
        environment_id: null,
        github_repository: "insecur-ci/example",
        github_environment: null,
        oidc_audience: "insecur://oidc/github-actions",
        credential_scopes: ["not-a-real-scope"],
        status: "active",
      },
      {
        id: machineAuthMethodId.brand("mauth_00000000000000000000000002"),
        org_id: ORG,
        machine_identity_id: MACHINE,
        project_id: PROJECT,
        environment_id: null,
        github_repository: "insecur-ci/example",
        github_environment: null,
        oidc_audience: "insecur://oidc/github-actions",
        credential_scopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
        status: "deleted",
      },
    ]);

    expect(await loadActiveGitHubActionsOidcAuthMethods(sql, ORG)).toEqual([]);
  });
});
