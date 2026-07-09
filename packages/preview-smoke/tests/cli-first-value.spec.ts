import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { INJECTION_ERROR_CODES } from "@insecur/domain";
import {
  asRecord,
  assertEqual,
  assertEnvelopeError,
  assertCliRunChildExitCode,
  assertCliSmokeSuccess,
  assertStatus,
  authHeaders,
  buildCliSecretsSetGenerateArgs,
  buildCliSecretsSetValueStdinArgs,
  createCliSmokeWorkspace,
  expect,
  mintSmokeSentinel,
  parseCliRunChildProof,
  parseCliSmokeJson,
  parseLastCliSmokeJson,
  PROOF_VARIABLE_KEY,
  randomUUID,
  readJsonResponse,
  redactorFor,
  requireString,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  runPlaintextSweep,
  test,
} from "../src/fixtures";
import { assertRecordsFreeOfSensitivePatterns } from "../src/audit-verification-assertions";
import {
  loadOrganizationAuditEvents,
  loadOrganizationOperationRows,
  withServiceRoleSql,
} from "../src/audit-verification-db";

const EXIT_VALIDATION = 2;
const SECRET_EMPTY_VALUE_ERROR = "secret.empty_value";
const SECRET_VALUE_TOO_LARGE_ERROR = "secret.value_too_large";
const GENERATED_SECRET_VARIABLE_KEY = "INSECUR_SMOKE_GENERATED_SECRET";
const EMPTY_SECRET_VARIABLE_KEY = "INSECUR_SMOKE_EMPTY_SECRET";
const RUNTIME_RUN_PROOF = "runtime-run-invariants";
const RUNTIME_RUN_CHILD_SCRIPT = `
const [stdoutMarker, stderrMarker, forbiddenKey] = process.argv.slice(1);
const value = process.env["${PROOF_VARIABLE_KEY}"];
if (typeof value !== "string" || value.length < 32) {
  console.log(JSON.stringify({ ok: false, reason: "missing_exact_variable_key" }));
  process.exit(10);
}
if (Object.prototype.hasOwnProperty.call(process.env, forbiddenKey)) {
  console.log(JSON.stringify({ ok: false, reason: "unexpected_extra_variable_key" }));
  process.exit(11);
}
console.log(stdoutMarker);
console.error(stderrMarker);
console.log(JSON.stringify({
  ok: true,
  checked: "${PROOF_VARIABLE_KEY}",
  absent: forbiddenKey,
  proof: "${RUNTIME_RUN_PROOF}"
}));
`;

interface RuntimeRunProbeResult {
  readonly grantId: string;
  readonly stderrMarker: string;
  readonly stdoutMarker: string;
}

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
  let organizationId = "";

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
      organizationId = requireString(
        asRecord(body.data, "CLI init data").organizationId,
        "CLI init organizationId",
      );
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
      const result = await runCliSmokeCommandExpectFailure({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(EMPTY_SECRET_VARIABLE_KEY),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set empty rejected",
        redactor,
        stdinInput: "",
      });
      if (result.exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set empty rejected exited ${String(result.exitCode)}`);
      }
      assertCliErrorCode(result, SECRET_EMPTY_VALUE_ERROR, "CLI secrets set empty rejected");
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
      const result = await runCliSmokeCommandExpectFailure({
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
      if (result.exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set oversized generated exited ${String(result.exitCode)}`);
      }
      assertCliErrorCode(
        result,
        SECRET_VALUE_TOO_LARGE_ERROR,
        "CLI secrets set oversized generated",
      );
    });

    await test.step("cli.run_first_value_runtime_invariants", async () => {
      const firstRun = await runRuntimeInvariantProbe({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI run first",
        redactor,
      });
      const secondRun = await runRuntimeInvariantProbe({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI run second",
        redactor,
      });
      if (firstRun.grantId === secondRun.grantId) {
        throw new Error("CLI run reused an injection grant across variable-key runs");
      }
      await assertGrantReplayDenied({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        grantId: firstRun.grantId,
        organizationId,
        redactor,
      });
      await assertGrantReplayDenied({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        grantId: secondRun.grantId,
        organizationId,
        redactor,
      });
      await assertRuntimeRunRecordsMetadataOnly({
        databaseUrl: preview.databaseUrl,
        markers: [
          firstRun.stdoutMarker,
          firstRun.stderrMarker,
          secondRun.stdoutMarker,
          secondRun.stderrMarker,
        ],
        organizationId,
        redactor,
      });
      test.info().annotations.push({
        type: "runtime_run.invariants",
        description:
          "fresh_one_use_grants, exact_variable_key_injection, passthrough_child_output, metadata_only_records",
      });
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

async function runRuntimeInvariantProbe(input: {
  readonly apiBaseUrl: string;
  readonly bearer: string;
  readonly configDir: string;
  readonly configHomeDir: string;
  readonly label: string;
  readonly redactor: (value: unknown) => string;
}): Promise<RuntimeRunProbeResult> {
  const suffix = randomUUID().replaceAll("-", "");
  const stdoutMarker = `INSECUR_RUNTIME_RUN_STDOUT_${suffix}`;
  const stderrMarker = `INSECUR_RUNTIME_RUN_STDERR_${suffix}`;
  const { stderr, stdout } = await runCliSmokeCommand({
    apiBaseUrl: input.apiBaseUrl,
    args: buildRuntimeInvariantRunArgs(stdoutMarker, stderrMarker),
    bearer: input.bearer,
    configDir: input.configDir,
    configHomeDir: input.configHomeDir,
    label: input.label,
    redactor: input.redactor,
  });
  if (!stdout.includes(stdoutMarker)) {
    throw new Error(`${input.label} child stdout marker was not passed through`);
  }
  if (!stderr.includes(stderrMarker)) {
    throw new Error(`${input.label} child stderr marker was not passed through`);
  }

  const body = parseLastCliSmokeJson(stdout, input.label);
  assertCliSmokeSuccess(body, input.label);
  assertCliRunChildExitCode(body, input.label);
  const data = asRecord(body.data, `${input.label} data`);
  assertEqual(data.variableKey, PROOF_VARIABLE_KEY, `${input.label} variableKey`);
  requireString(data.secretId, `${input.label} secretId`);
  requireString(data.secretVersionId, `${input.label} secretVersionId`);
  const grantId = requireString(data.grantId, `${input.label} grantId`);
  assertEnvelopeDoesNotPersistChildOutput(body, input.label, [stdoutMarker, stderrMarker]);

  const childProof = parseCliRunChildProof(stdout, input.label);
  assertRuntimeInvariantProof(childProof, input.label);
  return { grantId, stderrMarker, stdoutMarker };
}

function buildRuntimeInvariantRunArgs(
  stdoutMarker: string,
  stderrMarker: string,
): readonly string[] {
  return [
    "run",
    "--variable-key",
    PROOF_VARIABLE_KEY,
    "--",
    process.execPath,
    "--input-type=module",
    "--eval",
    RUNTIME_RUN_CHILD_SCRIPT,
    stdoutMarker,
    stderrMarker,
    GENERATED_SECRET_VARIABLE_KEY,
  ];
}

function assertRuntimeInvariantProof(proof: Record<string, unknown>, label: string): void {
  assertEqual(proof.ok, true, `${label} child proof ok`);
  assertEqual(proof.checked, PROOF_VARIABLE_KEY, `${label} child proof checked`);
  assertEqual(proof.absent, GENERATED_SECRET_VARIABLE_KEY, `${label} child proof absent`);
  assertEqual(proof.proof, RUNTIME_RUN_PROOF, `${label} child proof kind`);
}

function assertEnvelopeDoesNotPersistChildOutput(
  body: Record<string, unknown>,
  label: string,
  markers: readonly string[],
): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('"checked"');
  expect(serialized).not.toContain(RUNTIME_RUN_PROOF);
  expect(serialized).not.toMatch(/"std(?:out|err)"/i);
  for (const marker of markers) {
    if (serialized.includes(marker)) {
      throw new Error(`${label} persisted child output marker ${marker}`);
    }
  }
}

async function assertRuntimeRunRecordsMetadataOnly(input: {
  readonly databaseUrl: string;
  readonly markers: readonly string[];
  readonly organizationId: string;
  readonly redactor: (value: unknown) => string;
}): Promise<void> {
  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    const [auditRows, operationRows] = await Promise.all([
      loadOrganizationAuditEvents(sql, input.organizationId),
      loadOrganizationOperationRows(sql, input.organizationId),
    ]);
    assertRecordsFreeOfSensitivePatterns(input.redactor, "runtime run audit", auditRows);
    assertRecordsFreeOfSensitivePatterns(input.redactor, "runtime run operation", operationRows);
    assertRecordsDoNotContainMarkers("runtime run audit", auditRows, input.markers);
    assertRecordsDoNotContainMarkers("runtime run operation", operationRows, input.markers);
  });
}

async function assertGrantReplayDenied(input: {
  readonly apiBaseUrl: string;
  readonly bearer: string;
  readonly grantId: string;
  readonly organizationId: string;
  readonly redactor: (value: unknown) => string;
}): Promise<void> {
  const label = "CLI run grant replay";
  const response = await fetch(
    `${input.apiBaseUrl}/v1/orgs/${input.organizationId}/runtime-injection/grants/${input.grantId}/consume`,
    {
      body: JSON.stringify({
        organizationId: input.organizationId,
        variableKey: PROOF_VARIABLE_KEY,
      }),
      headers: { ...authHeaders(input.bearer), "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const text = await response.text();
  if (response.ok) {
    throw new Error(`${label} unexpectedly succeeded`);
  }
  assertStatus(response, 404, label, { bodyText: text, redactor: input.redactor });
  const body = await readJsonResponse(response, label, text);
  assertEnvelopeError(body, INJECTION_ERROR_CODES.grantDenied, label);
  if (JSON.stringify(body).includes(input.grantId)) {
    throw new Error(`${label} exposed replayed grant id in denial body`);
  }
}

function assertRecordsDoNotContainMarkers(
  label: string,
  records: readonly unknown[],
  markers: readonly string[],
): void {
  for (const [index, record] of records.entries()) {
    const serialized = JSON.stringify(record);
    for (const marker of markers) {
      if (serialized.includes(marker)) {
        throw new Error(`${label} record ${String(index)} persisted child output marker ${marker}`);
      }
    }
  }
}

function assertCliErrorCode(
  result: { readonly stderr: string; readonly stdout: string },
  expectedCode: string,
  label: string,
): void {
  if (result.stdout.trim() !== "") {
    throw new Error(`${label} must not write success JSON to stdout on failure`);
  }
  const body = parseLastCliSmokeJson(result.stderr, label);
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
