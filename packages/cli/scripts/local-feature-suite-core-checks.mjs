import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  commandOutput,
  digest,
  expect,
  expectJsonStderrOnly,
  expectJsonStdoutOnly,
  lastJson,
  parseJsonLines,
  redact,
} from "./local-feature-suite-support.mjs";

export async function runCoreChecks(context) {
  const { check, cli, projectDir, env, digestVerifierPath, firstValueVerifierPath } = context;

  await check("init writes local project config and profile", async () => {
    const result = await cli(["init"]);
    expect(result.code === 0, `init exited ${result.code}: ${redact(commandOutput(result))}`);
    expectJsonStdoutOnly(result, "init");
    const output = lastJson(result, "init");
    const config = JSON.parse(readFileSync(path.join(projectDir, ".insecur.json"), "utf8"));
    expect(output.ok === true, "init did not return ok");
    expect(config.host === "local", "project config host is not local");
    expect(config.orgId === undefined, "local project config unexpectedly contains orgId");
    expect(
      config.secretShapes?.some((shape) => shape.variableKey === "INSECUR_PROOF_SECRET"),
      "default First Value secret shape is missing",
    );
    return { profileSlug: output.data.profileSlug };
  });

  await check("missing local value reports machine-local remediation", async () => {
    const result = await cli([
      "run",
      "--variable-key",
      "INSECUR_PROOF_SECRET",
      "--",
      "node",
      "-e",
      "process.exit(0)",
    ]);
    expect(result.code === 2, `missing-value run exited ${result.code}`);
    expectJsonStderrOnly(result, "missing-value run");
    const output = lastJson(result, "missing-value run");
    expect(
      output.error?.code === "local.value_missing_on_machine",
      "missing value error code changed",
    );
    expect(output.remediation?.secretsSet?.includes("INSECUR_PROOF_SECRET"), "missing remediation");
  });

  await check("secrets list shows local manifest before values exist", async () => {
    const result = await cli(["secrets", "list"]);
    expect(
      result.code === 0,
      `secrets list exited ${result.code}: ${redact(commandOutput(result))}`,
    );
    expectJsonStdoutOnly(result, "secrets list before writes");
    const output = lastJson(result, "secrets list before writes");
    const firstValue = output.data.secrets.find(
      (secret) => secret.variableKey === "INSECUR_PROOF_SECRET",
    );
    expect(firstValue !== undefined, "First Value shape is missing from local list");
    expect(
      firstValue.currentVersion === undefined,
      "missing local value should not have a currentVersion",
    );
  });

  const exactSecretRef = { secretId: undefined };
  const exactValue = randomBytes(48).toString("base64url");
  await check("secrets set --value-stdin stores exact dummy value", async () => {
    const result = await cli(
      ["secrets", "set", "--variable-key", "EXACT_SECRET", "--value-stdin"],
      {
        stdin: exactValue,
      },
    );
    expect(result.code === 0, `set exact exited ${result.code}: ${redact(commandOutput(result))}`);
    expectJsonStdoutOnly(result, "set exact");
    const output = lastJson(result, "set exact");
    exactSecretRef.secretId = output.data.secretId;
    expect(output.data.variableKey === "EXACT_SECRET", "wrong variable key");
    expect(!JSON.stringify(output).includes(exactValue), "secret leaked in set output");
    const config = JSON.parse(readFileSync(path.join(projectDir, ".insecur.json"), "utf8"));
    expect(
      config.secretShapes?.some((shape) => shape.variableKey === "EXACT_SECRET"),
      "new local Secret Shape was not added to project config",
    );
  });

  await check("run injects exact value and strips parent session token", async () => {
    const result = await cli(
      [
        "run",
        "--variable-key",
        "EXACT_SECRET",
        "--",
        "node",
        digestVerifierPath,
        digest(exactValue),
        "EXACT_SECRET",
      ],
      {
        env: {
          ...env,
          INSECUR_SESSION_TOKEN: "parent-token-that-must-not-leak",
        },
      },
    );
    expect(result.code === 0, `run exact exited ${result.code}: ${redact(commandOutput(result))}`);
    const lines = parseJsonLines(commandOutput(result));
    expect(lines[0]?.ok === true, "verifier did not pass");
    expect(lines.at(-1)?.data?.childExitCode === 0, "CLI did not report child success");
  });

  await check("secrets set --generate random works with First Value verifier", async () => {
    const set = await cli([
      "secrets",
      "set",
      "--variable-key",
      "INSECUR_PROOF_SECRET",
      "--generate",
      "random",
      "--length",
      "32",
    ]);
    expect(set.code === 0, `generate set exited ${set.code}: ${redact(commandOutput(set))}`);
    const runResult = await cli([
      "run",
      "--variable-key",
      "INSECUR_PROOF_SECRET",
      "--",
      "node",
      firstValueVerifierPath,
    ]);
    expect(
      runResult.code === 0,
      `First Value run exited ${runResult.code}: ${redact(commandOutput(runResult))}`,
    );
    const lines = parseJsonLines(commandOutput(runResult));
    expect(lines[0]?.proof === "hmac-challenge", "First Value verifier did not run");
  });

  await check("secrets list and versions return metadata only", async () => {
    const list = await cli(["secrets", "list"]);
    expect(list.code === 0, `secrets list exited ${list.code}: ${redact(commandOutput(list))}`);
    const listOutput = lastJson(list, "secrets list");
    const exact = listOutput.data.secrets.find((secret) => secret.variableKey === "EXACT_SECRET");
    expect(exact?.currentVersion?.versionNumber === 1, "current version metadata is missing");
    expect(
      !/valueUtf8|plaintext|ciphertext/i.test(JSON.stringify(listOutput)),
      "list leaked sensitive fields",
    );

    const versions = await cli(["secrets", "versions", exactSecretRef.secretId]);
    expect(
      versions.code === 0,
      `versions exited ${versions.code}: ${redact(commandOutput(versions))}`,
    );
    const versionsOutput = lastJson(versions, "secrets versions");
    expect(
      versionsOutput.data.versions.length === 1,
      "local versions should show current version only",
    );
    expect(versionsOutput.data.versions[0].isCurrent === true, "current version flag missing");
    expect(
      !/valueUtf8|plaintext|ciphertext/i.test(JSON.stringify(versionsOutput)),
      "versions leaked sensitive fields",
    );
  });

  await check("empty values reject by default and work with --allow-empty", async () => {
    const rejected = await cli([
      "secrets",
      "set",
      "--variable-key",
      "EMPTY_SECRET",
      "--value-stdin",
    ]);
    expect(rejected.code === 2, `empty reject exited ${rejected.code}`);
    expectJsonStderrOnly(rejected, "empty reject");
    const rejectedOutput = lastJson(rejected, "empty reject");
    expect(rejectedOutput.error?.code === "secret.empty_value", "empty rejection code changed");

    const allowed = await cli(
      ["secrets", "set", "--variable-key", "EMPTY_SECRET", "--allow-empty", "--value-stdin"],
      { stdin: "" },
    );
    expect(
      allowed.code === 0,
      `allow-empty exited ${allowed.code}: ${redact(commandOutput(allowed))}`,
    );
    const runEmpty = await cli([
      "run",
      "--variable-key",
      "EMPTY_SECRET",
      "--",
      "node",
      "-e",
      "process.exit(process.env.EMPTY_SECRET === '' ? 0 : 42)",
    ]);
    expect(
      runEmpty.code === 0,
      `empty run exited ${runEmpty.code}: ${redact(commandOutput(runEmpty))}`,
    );
  });

  await check("invalid variable keys are rejected without normalization", async () => {
    const result = await cli(
      ["secrets", "set", "--variable-key", "lowercase-key", "--value-stdin"],
      {
        stdin: "not-real",
      },
    );
    expect(result.code === 2, `invalid variable key exited ${result.code}`);
    expectJsonStderrOnly(result, "invalid variable key");
    const output = lastJson(result, "invalid variable key");
    expect(
      output.error?.code?.startsWith("validation."),
      "invalid key did not use validation error",
    );
  });
}
