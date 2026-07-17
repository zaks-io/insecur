import {
  assertCliAuditExportBundleMetadataOnly,
  assertCliAuditTailMetadataOnly,
  assertCliAuditVerifyExpectedResult,
  assertCliOutputSafe,
  assertCliSecretsListMetadataOnly,
  assertCliSecretsVersionsMetadataOnly,
  assertCliSmokeSuccess,
  buildCliAuditExportArgs,
  buildCliAuditTailArgs,
  buildCliAuditVerifyArgs,
  buildCliFirstValueRunArgs,
  buildCliSecretsSetValueStdinArgs,
  buildCliSecretsVersionsArgs,
  createCliSmokeWorkspace,
  findById,
  mintSmokeSentinel,
  parseCliSmokeJson,
  redactorFor,
  requireString,
  resolveCliSmokePaths,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  test,
  writeCliAuditExportArtifact,
} from "../src/fixtures";

// `runAuditVerifyCommand` exits EXIT_VALIDATION (2) whenever the verification
// result status is "invalid" -- expected in preview today, since no HMAC
// secret is wired to the smoke job (see assertCliAuditVerifyExpectedResult).
const EXIT_OK = 0;
const EXIT_VALIDATION = 2;
const PROOF_VARIABLE_KEY = "INSECUR_PROOF_SECRET_AUDIT";

test("preview CLI metadata reads and audit export @preview @happy-path @metadata @custody", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
  const workspace = await createCliSmokeWorkspace();
  const { verifyScript } = resolveCliSmokePaths();
  const exportFrom = new Date(Date.now() - 5 * 60_000).toISOString();

  const runInput = {
    apiBaseUrl: preview.apiBaseUrl,
    bearer: ownerBearer,
    configDir: workspace.configDir,
    configHomeDir: workspace.configHomeDir,
    redactor,
  };

  let organizationId = "";
  let secretId = "";

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

    await test.step("cli.secrets_set_fixture", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliSecretsSetValueStdinArgs(PROOF_VARIABLE_KEY),
        label: "CLI secrets set",
        stdinInput: sentinel.value,
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets set");
      assertCliSmokeSuccess(body, "CLI secrets set");
    });

    await test.step("cli.run_first_value_proof", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliFirstValueRunArgs(verifyScript, PROOF_VARIABLE_KEY),
        label: "CLI run",
      });
      assertCliOutputSafe({ label: "CLI run", redactor, stderr: "", stdout });
    });

    await test.step("cli.secrets_list", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: ["secrets", "list"],
        label: "CLI secrets list",
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets list");
      const secrets = assertCliSecretsListMetadataOnly(body, "CLI secrets list");
      const secret = findById(secrets, "variableKey", PROOF_VARIABLE_KEY, "CLI secrets list");
      secretId = requireString(secret.secretId, "CLI secrets list secretId");
    });

    await test.step("cli.secrets_versions", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliSecretsVersionsArgs(secretId),
        label: "CLI secrets versions",
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets versions");
      const { versions } = assertCliSecretsVersionsMetadataOnly(body, "CLI secrets versions");
      if (versions.length === 0) {
        throw new Error("CLI secrets versions returned no version metadata");
      }
      for (const [index, version] of versions.entries()) {
        if (typeof version.secretVersionId !== "string" || version.secretVersionId === "") {
          throw new Error(`CLI secrets versions entry ${String(index)} missing secretVersionId`);
        }
        if (typeof version.versionNumber !== "number") {
          throw new Error(`CLI secrets versions entry ${String(index)} missing versionNumber`);
        }
      }
    });

    await test.step("cli.audit_tail", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliAuditTailArgs(),
        label: "CLI audit tail",
      });
      const body = parseCliSmokeJson(stdout, "CLI audit tail");
      const events = assertCliAuditTailMetadataOnly(body, "CLI audit tail");
      if (events.length === 0) {
        throw new Error("CLI audit tail returned no tenant-scoped events for the smoke run.");
      }
    });

    let exportBody: Record<string, unknown> = {};
    await test.step("cli.audit_export", async () => {
      const exportTo = new Date(Date.now() + 60_000).toISOString();
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliAuditExportArgs(exportFrom, exportTo),
        label: "CLI audit export",
      });
      exportBody = parseCliSmokeJson(stdout, "CLI audit export");
      assertCliAuditExportBundleMetadataOnly(exportBody, "CLI audit export");
    });

    await test.step("cli.audit_verify", async () => {
      const { jsonlPath, manifestPath } = await writeCliAuditExportArtifact(
        workspace.configDir,
        exportBody,
        "CLI audit export",
      );
      const { exitCode, stdout } = await runCliSmokeCommandExpectFailure({
        ...runInput,
        args: buildCliAuditVerifyArgs(
          jsonlPath,
          manifestPath,
          `${preview.siteBaseUrl}/.well-known/insecur/audit-export-signing-keys.json`,
        ),
        cwd: workspace.configDir,
        label: "CLI audit verify",
      });
      if (exitCode !== EXIT_OK && exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI audit verify exited unexpected code ${String(exitCode)}`);
      }
      const body = parseCliSmokeJson(stdout, "CLI audit verify");
      assertCliAuditVerifyExpectedResult(body, "CLI audit verify", organizationId);
    });
  } finally {
    await workspace.cleanup();
  }
});
