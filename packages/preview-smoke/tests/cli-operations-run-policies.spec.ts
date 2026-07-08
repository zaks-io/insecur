import {
  assertCliErrorEnvelope,
  assertCliOperationPollMetadataOnly,
  assertCliRunPolicyCreateMetadataOnly,
  assertCliRunPolicyDisableMetadataOnly,
  assertCliRunPolicyShowMetadataOnly,
  assertCliSecretsListMetadataOnly,
  assertCliSmokeSuccess,
  buildCliOperationsGetArgs,
  buildCliOperationsWaitArgs,
  buildCliRunPoliciesCreateArgs,
  buildCliRunPoliciesDisableArgs,
  buildCliRunPoliciesShowArgs,
  buildCliSecretsSetValueStdinArgs,
  createCliSmokeWorkspace,
  findById,
  mintSmokeOperationId,
  mintSmokeSentinel,
  parseCliSmokeJson,
  PROOF_VARIABLE_KEY,
  provisionSmokeOperationForPoll,
  redactorFor,
  requireString,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  runtimePolicyId,
  test,
} from "../src/fixtures";

const EXIT_NOT_FOUND = 5;

test("preview CLI operations and run-policy commands @preview @happy-path @custody", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
  const workspace = await createCliSmokeWorkspace();
  const operationId = mintSmokeOperationId();
  const policyId = runtimePolicyId.generate();

  const runInput = {
    apiBaseUrl: preview.apiBaseUrl,
    bearer: ownerBearer,
    configDir: workspace.configDir,
    configHomeDir: workspace.configHomeDir,
    redactor,
  };

  let organizationId = "";
  let environmentId = "";
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
      environmentId = requireString(data.environmentId, "CLI init environmentId");
    });

    await test.step("fixture.operation_poll_row", async () => {
      await provisionSmokeOperationForPoll({
        databaseUrl: preview.databaseUrl,
        operationId,
        organizationId,
      });
    });

    await test.step("cli.operations_get", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliOperationsGetArgs(operationId),
        label: "CLI operations get",
      });
      const body = parseCliSmokeJson(stdout, "CLI operations get");
      const data = assertCliOperationPollMetadataOnly(body, "CLI operations get");
      if (data.operationId !== operationId) {
        throw new Error(
          `CLI operations get returned operationId ${String(data.operationId)}, expected ${operationId}`,
        );
      }
    });

    await test.step("cli.operations_wait", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliOperationsWaitArgs(operationId, 30),
        label: "CLI operations wait",
      });
      const body = parseCliSmokeJson(stdout, "CLI operations wait");
      const data = assertCliOperationPollMetadataOnly(body, "CLI operations wait");
      if (data.state !== "succeeded") {
        throw new Error(`CLI operations wait returned non-terminal state ${String(data.state)}`);
      }
    });

    await test.step("cli.operations_get_not_found", async () => {
      const bogusOperationId = mintSmokeOperationId();
      const result = await runCliSmokeCommandExpectFailure({
        ...runInput,
        args: buildCliOperationsGetArgs(bogusOperationId),
        label: "CLI operations get not-found",
      });
      assertCliErrorEnvelope({
        exitCode: result.exitCode,
        expectedErrorCode: "operation.not_found",
        expectedExitCode: EXIT_NOT_FOUND,
        label: "CLI operations get not-found",
        stderr: result.stderr,
        stdout: result.stdout,
      });
    });

    await test.step("cli.secrets_set_fixture", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliSecretsSetValueStdinArgs(),
        label: "CLI secrets set",
        stdinInput: sentinel.value,
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets set");
      assertCliSmokeSuccess(body, "CLI secrets set");
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

    await test.step("cli.run_policies_create", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliRunPoliciesCreateArgs({
          command: "printenv",
          envId: environmentId,
          policyId,
          secretIds: [secretId],
        }),
        label: "CLI run-policies create",
        stdinInput: "Preview Smoke Run Policy",
      });
      const body = parseCliSmokeJson(stdout, "CLI run-policies create");
      const data = assertCliRunPolicyCreateMetadataOnly(body, "CLI run-policies create");
      if (data.policyId !== policyId) {
        throw new Error(
          `CLI run-policies create returned policyId ${String(data.policyId)}, expected ${policyId}`,
        );
      }
    });

    await test.step("cli.run_policies_show", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliRunPoliciesShowArgs(policyId),
        label: "CLI run-policies show",
      });
      const body = parseCliSmokeJson(stdout, "CLI run-policies show");
      const data = assertCliRunPolicyShowMetadataOnly(body, "CLI run-policies show");
      if (data.organizationId !== organizationId) {
        throw new Error(
          `CLI run-policies show returned organizationId ${String(data.organizationId)}, expected ${organizationId}`,
        );
      }
    });

    await test.step("cli.run_policies_disable", async () => {
      const { stdout } = await runCliSmokeCommand({
        ...runInput,
        args: buildCliRunPoliciesDisableArgs({
          comment: "Preview smoke teardown",
          envId: environmentId,
          policyId,
        }),
        label: "CLI run-policies disable",
      });
      const body = parseCliSmokeJson(stdout, "CLI run-policies disable");
      const data = assertCliRunPolicyDisableMetadataOnly(body, "CLI run-policies disable");
      if (data.policyId !== policyId) {
        throw new Error(
          `CLI run-policies disable returned policyId ${String(data.policyId)}, expected ${policyId}`,
        );
      }
    });

    await test.step("cli.run_policies_show_not_found", async () => {
      const bogusPolicyId = runtimePolicyId.generate();
      const result = await runCliSmokeCommandExpectFailure({
        ...runInput,
        args: buildCliRunPoliciesShowArgs(bogusPolicyId),
        label: "CLI run-policies show not-found",
      });
      assertCliErrorEnvelope({
        exitCode: result.exitCode,
        expectedErrorCode: "runtime_policy.not_found",
        expectedExitCode: EXIT_NOT_FOUND,
        label: "CLI run-policies show not-found",
        stderr: result.stderr,
        stdout: result.stdout,
      });
    });
  } finally {
    await workspace.cleanup();
  }
});
