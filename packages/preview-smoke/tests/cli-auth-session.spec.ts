import { randomUUID } from "node:crypto";

import {
  assertCliAuthFailure,
  assertCliConfigShowSuccess,
  assertCliLogoutSuccess,
  assertCliNavigationListSuccess,
  assertCliWhoamiSuccess,
  assertResponseFreeOfRedactedPatterns,
  createCliSmokeWorkspace,
  findById,
  mintBearer,
  parseCliSmokeJson,
  redactorForPreview,
  requireString,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  test,
} from "../src/fixtures";

test("preview CLI auth, session, and navigation @preview @happy-path @custody", async ({
  preview,
}) => {
  test.setTimeout(180_000);

  const sessionId = `session_preview_smoke_cli_auth_${randomUUID()}`;
  const bearer = await mintBearer({
    rawUserId: preview.ownerUserId,
    sessionId,
    signingSecret: preview.signingSecret,
    workosUserId: preview.ownerWorkosUserId,
  });
  const workspace = await createCliSmokeWorkspace();
  const redactor = redactorForPreview(preview, [
    bearer,
    workspace.configDir,
    workspace.configHomeDir,
  ]);

  const runInput = {
    apiBaseUrl: preview.apiBaseUrl,
    bearer,
    configDir: workspace.configDir,
    configHomeDir: workspace.configHomeDir,
    redactor,
  };

  let organizationId = "";
  let projectId = "";
  let environmentId = "";

  try {
    await test.step("cli.whoami", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["whoami"],
        label: "CLI whoami",
      });
      const body = parseCliSmokeJson(stdout, "CLI whoami");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI whoami");
      assertCliWhoamiSuccess(body, preview, { label: "CLI whoami" });
    });

    await test.step("cli.init", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["init"],
        label: "CLI init",
      });
      const body = parseCliSmokeJson(stdout, "CLI init");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI init");
      const data = body.data as Record<string, unknown>;
      organizationId = requireString(data.organizationId, "CLI init organizationId");
      projectId = requireString(data.projectId, "CLI init projectId");
      environmentId = requireString(data.environmentId, "CLI init environmentId");
    });

    await test.step("cli.whoami_resolved_scope", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["whoami"],
        label: "CLI whoami resolved scope",
      });
      const body = parseCliSmokeJson(stdout, "CLI whoami resolved scope");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI whoami resolved scope");
      assertCliWhoamiSuccess(body, preview, {
        label: "CLI whoami resolved scope",
        organizationId,
        projectId,
        environmentId,
      });
    });

    await test.step("cli.orgs_list", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["orgs", "list"],
        label: "CLI orgs list",
      });
      const body = parseCliSmokeJson(stdout, "CLI orgs list");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI orgs list");
      const organizations = assertCliNavigationListSuccess(body, "CLI orgs list", "organizations");
      findById(organizations, "organizationId", organizationId, "CLI orgs list");
    });

    await test.step("cli.projects_list", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["projects", "list"],
        label: "CLI projects list",
      });
      const body = parseCliSmokeJson(stdout, "CLI projects list");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI projects list");
      const projects = assertCliNavigationListSuccess(body, "CLI projects list", "projects");
      findById(projects, "projectId", projectId, "CLI projects list");
    });

    await test.step("cli.envs_list", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["envs", "list"],
        label: "CLI envs list",
      });
      const body = parseCliSmokeJson(stdout, "CLI envs list");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI envs list");
      const environments = assertCliNavigationListSuccess(body, "CLI envs list", "environments");
      findById(environments, "environmentId", environmentId, "CLI envs list");
    });

    await test.step("cli.config_show", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["config", "show"],
        label: "CLI config show",
      });
      const body = parseCliSmokeJson(stdout, "CLI config show");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI config show");
      assertCliConfigShowSuccess(body, "CLI config show", {
        host: preview.apiBaseUrl,
        organizationId,
        projectId,
        environmentId,
      });
    });

    await test.step("cli.logout", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["logout"],
        label: "CLI logout",
      });
      const body = parseCliSmokeJson(stdout, "CLI logout");
      assertResponseFreeOfRedactedPatterns(redactor, body, "CLI logout");
      assertCliLogoutSuccess(body, "CLI logout");
    });

    await test.step("cli.whoami_after_logout", async () => {
      const result = await runCliSmokeCommandExpectFailure({
        ...runInput,
        args: ["whoami"],
        label: "CLI whoami after logout",
      });
      assertResponseFreeOfRedactedPatterns(redactor, result, "CLI whoami after logout");
      assertCliAuthFailure({
        exitCode: result.exitCode,
        label: "CLI whoami after logout",
        stderr: result.stderr,
        stdout: result.stdout,
      });
    });
  } finally {
    await workspace.cleanup();
  }
});
