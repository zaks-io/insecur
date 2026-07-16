import {
  appConnectionId,
  assertCliConnectionsListMetadataOnly,
  assertCliConnectionStatusNotFound,
  assertCliOutputSafe,
  assertCliSmokeSuccess,
  buildCliConnectionsListArgs,
  buildCliConnectionsStatusArgs,
  createCliSmokeWorkspace,
  mintSmokeSentinel,
  parseCliSmokeJson,
  redactorFor,
  requireString,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  test,
} from "../src/fixtures";

/**
 * Drives the `insecur connections` command group through the built CLI process
 * against the deployed preview App Connection routes (INS-504):
 *
 *  - `connections list --json` exercises GET /v1/orgs/:organizationId/connections
 *    and asserts a metadata-only success envelope for the smoke organization.
 *  - `connections status <fresh-conn-id>` exercises
 *    GET /v1/orgs/:organizationId/connections/:connectionId with a valid-shaped
 *    but nonexistent id. This is the credential-free non-list path: it needs no
 *    real third-party provider credential, resolves inside the smoke org tenant
 *    boundary, and must return the stable `connection.not_found` error envelope
 *    (exit 5) on stderr. It is a READ, so no auditEventId is minted and INS-494
 *    audit verification does not apply.
 *
 * Every CLI stdout/stderr surface is proven metadata-only: no provider token,
 * OAuth code, scoped credential, or sensitive boundary value may appear.
 */
test("preview CLI connections list and status @preview @happy-path @metadata @connections", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(120_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
  const workspace = await createCliSmokeWorkspace();

  const runInput = {
    apiBaseUrl: preview.apiBaseUrl,
    bearer: ownerBearer,
    configDir: workspace.configDir,
    configHomeDir: workspace.configHomeDir,
    redactor,
  };

  let organizationId = "";

  try {
    await test.step("cli.init", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["init"],
        label: "CLI init",
      });
      const body = parseCliSmokeJson(stdout, "CLI init");
      assertCliSmokeSuccess(body, "CLI init");
      const data = body.data as Record<string, unknown>;
      organizationId = requireString(data.organizationId, "CLI init organizationId");
    });

    await test.step("cli.connections_list", async () => {
      const { stdout, stderr } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliConnectionsListArgs(),
        label: "CLI connections list",
      });
      assertCliOutputSafe({ label: "CLI connections list", redactor, stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI connections list");
      assertCliConnectionsListMetadataOnly(body, "CLI connections list", organizationId);
    });

    await test.step("cli.connections_status_not_found", async () => {
      const missingConnectionId = appConnectionId.generate();
      const { exitCode, stdout, stderr } = await runCliSmokeCommandExpectFailure({
        ...runInput,
        args: buildCliConnectionsStatusArgs(missingConnectionId),
        label: "CLI connections status",
      });
      assertCliConnectionStatusNotFound({
        exitCode,
        label: "CLI connections status",
        stderr,
        stdout,
      });
    });
  } finally {
    await workspace.cleanup();
  }
});
