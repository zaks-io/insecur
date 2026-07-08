import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  commandOutput,
  digest,
  expect,
  expectJsonStderrOnly,
  expectJsonStdoutOnly,
  lastJson,
  redact,
  run,
} from "./local-feature-suite-support.mjs";

export async function runImportAndGuardrailChecks(context) {
  const { check, cli, projectDir, env, cliPath, digestVerifierPath } = context;
  const importedApiKey = `fake-import-${randomBytes(16).toString("hex")}`;
  const importedOther = `fake-other-${randomBytes(16).toString("hex")}`;
  const dotenvPath = path.join(projectDir, ".env");
  await writeFile(
    dotenvPath,
    `DOTENV_API_KEY=${importedApiKey}\nDOTENV_OTHER_SECRET=${importedOther}\n`,
    "utf8",
  );

  await check("import --dry-run plans local dotenv writes without values", async () => {
    const result = await cli(["import", dotenvPath, "--dry-run"]);
    expect(
      result.code === 0,
      `import dry-run exited ${result.code}: ${redact(commandOutput(result))}`,
    );
    expectJsonStdoutOnly(result, "import dry-run");
    const output = lastJson(result, "import dry-run");
    expect(output.data.plan.ready === true, "dry-run plan is not ready");
    expect(output.data.plan.writeCount === 2, "dry-run write count changed");
    expect(!JSON.stringify(output).includes(importedApiKey), "dry-run leaked dotenv value");
  });

  await check("import writes local dotenv secrets and run can inject them", async () => {
    const result = await cli(["import", dotenvPath]);
    expect(result.code === 0, `import exited ${result.code}: ${redact(commandOutput(result))}`);
    expectJsonStdoutOnly(result, "import");
    const output = lastJson(result, "import");
    expect(output.data.importedCount === 2, "import count changed");
    expect(!JSON.stringify(output).includes(importedApiKey), "import leaked dotenv value");
    const injected = await cli([
      "run",
      "--variable-key",
      "DOTENV_API_KEY",
      "--",
      "node",
      digestVerifierPath,
      digest(importedApiKey),
      "DOTENV_API_KEY",
    ]);
    expect(
      injected.code === 0,
      `imported run exited ${injected.code}: ${redact(commandOutput(injected))}`,
    );
  });

  await check("import is create-only and rejects existing keys", async () => {
    const result = await cli(["import", dotenvPath]);
    expect(result.code === 6, `conflicting import exited ${result.code}`);
    expect(
      result.stdout.trim().startsWith("{"),
      "conflicting import did not write plan JSON to stdout",
    );
    expect(
      result.stderr.trim().startsWith("{"),
      "conflicting import did not write error JSON to stderr",
    );
    const output = lastJson(result.stdout, "conflicting import plan");
    const errorOutput = lastJson(result.stderr, "conflicting import error");
    expect(output.ok === true, "conflicting import did not render a plan envelope");
    expect(output.data.plan.ready === false, "conflicting import plan was unexpectedly ready");
    expect(output.data.plan.writeCount === 0, "conflicting import should not plan writes");
    expect(
      errorOutput.error?.code === "import.existing_secret",
      "conflicting import error code changed",
    );
    expect(
      commandOutput(result).includes("import.existing_secret"),
      "conflicting import did not report existing-secret",
    );
  });

  await check("scan strict detects local plaintext file metadata-only", async () => {
    const result = await cli(["scan", "--strict"]);
    expect(result.code === 7, `strict scan exited ${result.code}`);
    const output = lastJson(result, "strict scan");
    expect(output.data.summary.likelySecrets > 0, "strict scan did not find .env secret");
    expect(!JSON.stringify(output).includes(importedApiKey), "scan leaked .env value");
  });

  await check("local-files rm deletes plaintext source and scan becomes clean", async () => {
    const rm = await cli(["local-files", "rm", dotenvPath, "--yes"]);
    expect(rm.code === 0, `local-files rm exited ${rm.code}: ${redact(commandOutput(rm))}`);
    expect(!existsSync(dotenvPath), "local file still exists after rm");
    const scan = await cli(["scan", "--strict"]);
    expect(scan.code === 0, `post-rm scan exited ${scan.code}: ${redact(commandOutput(scan))}`);
    const output = lastJson(scan, "post-rm scan");
    expect(output.data.summary.likelySecrets === 0, "post-rm scan still found likely secrets");
  });

  await check("hosted-only commands fail with Local Mode remediation", async () => {
    const result = await cli(["orgs", "list"]);
    expect(result.code === 4, `orgs list exited ${result.code}`);
    expectJsonStderrOnly(result, "orgs list");
    const output = lastJson(result, "orgs list");
    expect(
      output.error?.code === "local.cloud_feature_unavailable",
      "wrong local cloud guard code",
    );
    expect(Array.isArray(output.remediation?.login), "missing login remediation");
  });

  await check("guide works offline without revealing secrets", async () => {
    const result = await run("node", [cliPath, "guide", "migrate-env"], { env });
    expect(result.code === 0, `guide exited ${result.code}`);
    expect(result.stdout.includes("insecur run"), "guide output missing run guidance");
    expect(!result.stdout.includes(importedApiKey), "guide somehow included test secret");
  });
}
