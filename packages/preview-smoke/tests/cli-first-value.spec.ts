import {
  assertCliRunChildExitCode,
  assertCliSmokeSuccess,
  buildCliFirstValueRunArgs,
  buildCliSecretsSetGenerateArgs,
  createCliSmokeWorkspace,
  parseCliSmokeJson,
  redactorFor,
  resolveCliSmokePaths,
  runCliSmokeCommand,
  test,
} from "../src/fixtures";

test("preview CLI first-value proof @preview @happy-path @custody", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const redactor = redactorFor(preview, { fingerprint: "", value: "", variants: [] }, [
    ownerBearer,
  ]);
  const workspace = await createCliSmokeWorkspace();
  const { verifyScript } = resolveCliSmokePaths();

  try {
    await test.step("cli.init", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: ["init"],
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI init",
        redactor,
      });
      const body = parseCliSmokeJson(stdout, "CLI init");
      assertCliSmokeSuccess(body, "CLI init");
    });

    await test.step("cli.secrets_set_generate", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetGenerateArgs(),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set",
        redactor,
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets set");
      assertCliSmokeSuccess(body, "CLI secrets set");
    });

    await test.step("cli.run_first_value_proof", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliFirstValueRunArgs(verifyScript),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI run",
        redactor,
      });
      const body = parseCliSmokeJson(stdout, "CLI run");
      assertCliSmokeSuccess(body, "CLI run");
      assertCliRunChildExitCode(body, "CLI run");
    });
  } finally {
    await workspace.cleanup();
  }
});
