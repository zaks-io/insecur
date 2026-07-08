import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCoreChecks } from "./local-feature-suite-core-checks.mjs";
import { runImportAndGuardrailChecks } from "./local-feature-suite-import-checks.mjs";
import { createCli, redact } from "./local-feature-suite-support.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const cliPath = path.join(repoRoot, "packages/cli/dist/index.js");
const digestVerifierPath = path.join(scriptDir, "verify-injected-secret.mjs");
const firstValueVerifierPath = path.join(repoRoot, "examples/first-value-proof/verify.mjs");

async function main() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "insecur-local-feature-project-"));
  const configHome = await mkdtemp(path.join(tmpdir(), "insecur-local-feature-home-"));
  const env = {
    HOME: process.env.HOME ?? configHome,
    INSECUR_CONFIG_HOME: configHome,
    PATH: process.env.PATH ?? "",
    SHELL: process.env.SHELL ?? "/bin/zsh",
  };
  const cli = createCli({ cliPath, env, projectDir, repoRoot });
  const checks = [];

  async function check(name, fn) {
    try {
      const details = await fn();
      checks.push({ name, ok: true, ...(details === undefined ? {} : { details }) });
    } catch (error) {
      checks.push({
        name,
        ok: false,
        error: redact(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  const context = {
    check,
    cli,
    cliPath,
    digestVerifierPath,
    env,
    firstValueVerifierPath,
    configHome,
    projectDir,
  };

  await runCoreChecks(context);
  await runImportAndGuardrailChecks(context);

  const failed = checks.filter((entry) => !entry.ok);
  console.log(
    JSON.stringify({
      ok: failed.length === 0,
      checked: checks.length,
      failed: failed.length,
      projectDir,
      configHome,
      checks,
    }),
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

await main();
