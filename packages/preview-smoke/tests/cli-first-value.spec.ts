import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  assertCliRunChildExitCode,
  assertCliRunChildObservedSentinel,
  assertCliSmokeSuccess,
  buildCliFirstValueRunArgs,
  buildCliSecretsSetGenerateArgs,
  buildCliSecretsSetValueStdinArgs,
  createCliSmokeWorkspace,
  expect,
  mintSmokeSentinel,
  parseCliRunChildProof,
  parseCliSmokeJson,
  parseLastCliSmokeJson,
  redactorFor,
  requireString,
  resolveCliSmokePaths,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  runPlaintextSweep,
  test,
} from "../src/fixtures";

const EXIT_VALIDATION = 2;
const SECRET_EMPTY_VALUE_ERROR = "secret.empty_value";
const SECRET_VALUE_TOO_LARGE_ERROR = "secret.value_too_large";
const GENERATED_SECRET_VARIABLE_KEY = "INSECUR_SMOKE_GENERATED_SECRET";
const EMPTY_SECRET_VARIABLE_KEY = "INSECUR_SMOKE_EMPTY_SECRET";

test("preview CLI first-value proof @preview @happy-path @custody", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  // Inject a KNOWN sentinel so the redactor can catch the exact injected value
  // (in every encoding) if `insecur run` or the child leaks it to stdout/stderr.
  const sentinel = mintMultilineSmokeSentinel();
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
      assertSecretWriteMetadataOnly(body, "CLI secrets set");
    });

    await test.step("cli.secrets_set_generated", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetGenerateArgs({ variableKey: GENERATED_SECRET_VARIABLE_KEY }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set generated",
        redactor,
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets set generated");
      assertCliSmokeSuccess(body, "CLI secrets set generated");
      assertSecretWriteMetadataOnly(body, "CLI secrets set generated");
    });

    await test.step("cli.secrets_set_empty_rejects_without_opt_in", async () => {
      const { exitCode, stderr } = await runCliSmokeCommandExpectFailure({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(EMPTY_SECRET_VARIABLE_KEY),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set empty rejected",
        redactor,
        stdinInput: "",
      });
      if (exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set empty rejected exited ${String(exitCode)}`);
      }
      assertCliErrorCode(stderr, SECRET_EMPTY_VALUE_ERROR, "CLI secrets set empty rejected");
    });

    await test.step("cli.secrets_set_empty_allow_empty", async () => {
      const { stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(EMPTY_SECRET_VARIABLE_KEY, { allowEmpty: true }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set empty allow-empty",
        redactor,
        stdinInput: "",
      });
      const body = parseCliSmokeJson(stdout, "CLI secrets set empty allow-empty");
      assertCliSmokeSuccess(body, "CLI secrets set empty allow-empty");
      assertSecretWriteMetadataOnly(body, "CLI secrets set empty allow-empty");
    });

    await test.step("cli.secrets_set_generated_length_validation", async () => {
      const { exitCode, stderr } = await runCliSmokeCommandExpectFailure({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetGenerateArgs({
          lengthBytes: 49_153,
          variableKey: "INSECUR_SMOKE_TOO_LARGE_SECRET",
        }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set oversized generated",
        redactor,
      });
      if (exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set oversized generated exited ${String(exitCode)}`);
      }
      assertCliErrorCode(
        stderr,
        SECRET_VALUE_TOO_LARGE_ERROR,
        "CLI secrets set oversized generated",
      );
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

    await test.step("plaintext_sweep.cli_secret_stdin", async () => {
      const sweep = await runPlaintextSweep(preview.databaseUrl, sentinel);
      if (sweep.hits.length > 0) {
        throw new Error(
          `Plaintext sweep found ${String(sweep.hits.length)} sentinel hit(s): ${JSON.stringify(sweep.hits)}`,
        );
      }
    });
  } finally {
    await workspace.cleanup();
  }
});

function assertSecretWriteMetadataOnly(body: Record<string, unknown>, label: string): void {
  const data = body.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${label} data must be an object`);
  }
  const record = data as Record<string, unknown>;
  requireString(record.secretId, `${label} secretId`);
  requireString(record.secretVersionId, `${label} secretVersionId`);
  requireString(record.variableKey, `${label} variableKey`);
  expect(JSON.stringify(body)).not.toMatch(/valueUtf8|encodedValueUtf8|plaintext/i);
}

function assertCliErrorCode(stderr: string, expectedCode: string, label: string): void {
  const body = parseCliSmokeJson(stderr, label);
  const error = body.error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    throw new Error(`${label} error must be an object`);
  }
  expect((error as Record<string, unknown>).code).toBe(expectedCode);
}

function mintMultilineSmokeSentinel(): ReturnType<typeof mintSmokeSentinel> {
  const base = mintSmokeSentinel();
  const value = `${base.value}\nline-two\n`;
  const bytes = Buffer.from(value, "utf8");
  return {
    fingerprint: createHash("sha256").update(value).digest("hex"),
    value,
    variants: [
      { encoding: "raw", pattern: value },
      { encoding: "base64", pattern: bytes.toString("base64") },
      { encoding: "base64url", pattern: bytes.toString("base64url") },
      { encoding: "hex", pattern: bytes.toString("hex") },
    ],
  };
}
