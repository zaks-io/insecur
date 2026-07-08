import {
  assertCliRunChildExitCode,
  assertCliRunChildObservedSentinel,
  assertCliSmokeSuccess,
  buildCliFirstValueRunArgs,
  buildCliSecretsSetValueStdinArgs,
  createCliSmokeWorkspace,
  mintSmokeSentinel,
  parseCliRunChildProof,
  parseCliSmokeJson,
  parseLastCliSmokeJson,
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

  // Inject a KNOWN sentinel so the redactor can catch the exact injected value
  // (in every encoding) if `insecur run` or the child leaks it to stdout/stderr.
  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
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

    await test.step("cli.secrets_set", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set",
        redactor,
        stdinInput: sentinel.value,
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
      const body = parseLastCliSmokeJson(stdout, "CLI run");
      assertCliSmokeSuccess(body, "CLI run");
      assertCliRunChildExitCode(body, "CLI run");
      const childProof = parseCliRunChildProof(stdout, "CLI run");
      assertCliRunChildObservedSentinel(childProof, "CLI run");
    });
  } finally {
    await workspace.cleanup();
  }
});
