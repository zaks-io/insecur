import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { basename } from "node:path";

import { INJECTION_ERROR_CODES } from "@insecur/domain";
import {
  assertEqual,
  assertEnvelopeError,
  assertCliConfigSurfacesMetadataOnly,
  assertCliHumanOutputMetadataOnly,
  assertCliInitEnvelopeMetadataOnly,
  assertCliRunChildExitCode,
  assertCliRunEnvelopeMetadataOnly,
  assertCliSecretWriteEnvelopeMetadataOnly,
  assertRecordedCliOutputsMetadataOnly,
  assertStatus,
  authHeaders,
  buildCliRuntimeInvariantRunArgs,
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
  readCliConfigSurfaces,
  readJsonResponse,
  redactorFor,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  runPlaintextSweep,
  test,
  type CliFirstValueConfigIdentity,
  type RecordedCliOutputSurface,
  type SensitiveMaterial,
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
const HUMAN_GENERATED_SECRET_VARIABLE_KEY = "INSECUR_SMOKE_HUMAN_SECRET";
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

function mintRuntimeRunMarkers(): { stdoutMarker: string; stderrMarker: string } {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    stdoutMarker: `INSECUR_RUNTIME_RUN_STDOUT_${suffix}`,
    stderrMarker: `INSECUR_RUNTIME_RUN_STDERR_${suffix}`,
  };
}

test("preview CLI first-value proof @preview @happy-path @custody", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(240_000);

  // Inject a KNOWN sentinel so the redactor can catch the exact injected value
  // (in every encoding) if `insecur run` or the child leaks it to stdout/stderr.
  const sentinel = mintMultilineSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
  // The redactor only knows the RAW bearer; as named material it is also
  // proven absent in base64/base64url/hex encodings (INS-368).
  const bearerMaterial: SensitiveMaterial = { name: "smoke bearer credential", value: ownerBearer };
  const workspace = await createCliSmokeWorkspace();
  // The isolated workspace temp dirs are hyphenated `insecur-preview-cli-*`
  // names that read as dense `[A-Za-z0-9_-]` runs; they legitimately appear in
  // `configPath` and human output. Allowlist them so the (deliberately low,
  // 16-byte-floor) secret-shaped-token scan does not flag known-safe paths.
  const workspacePathTokens = [
    basename(workspace.configDir),
    basename(workspace.configHomeDir),
    workspace.configDir,
    workspace.configHomeDir,
  ];
  // Every CLI stdout/stderr surface is captured here and re-scanned at the end
  // once ALL sensitive material is known (the file-fallback machine root key
  // may only exist after the first CLI call).
  const outputSurfaces: RecordedCliOutputSurface[] = [];
  const recordOutputs = (
    name: string,
    channels: { readonly stdout: string; readonly stderr: string },
    allowedTokens?: readonly string[],
  ): void => {
    for (const channel of ["stdout", "stderr"] as const) {
      outputSurfaces.push({
        name: `${name} ${channel}`,
        text: channels[channel],
        ...(allowedTokens === undefined ? {} : { allowedTokens }),
      });
    }
  };
  let configIdentity: CliFirstValueConfigIdentity | undefined;

  try {
    await test.step("cli.init", async () => {
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: ["init"],
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI init",
        redactor,
      });
      recordOutputs("CLI init", { stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI init");
      const initIdentity = assertCliInitEnvelopeMetadataOnly(body, "CLI init", workspacePathTokens);

      // The files `insecur init` just wrote are metadata-only: host/profile
      // metadata plus opaque ids, and provably free of the smoke bearer, the
      // sentinel, machine root key material, and secret-shaped blobs.
      const surfaces = await readCliConfigSurfaces(workspace);
      configIdentity = assertCliConfigSurfacesMetadataOnly({
        surfaces,
        label: "CLI init config files",
        apiBaseUrl: preview.apiBaseUrl,
        redactor,
        forbiddenMaterials: [bearerMaterial],
      });
      assertEqual(
        JSON.stringify(configIdentity),
        JSON.stringify({
          organizationId: initIdentity.organizationId,
          projectId: initIdentity.projectId,
          environmentId: initIdentity.environmentId,
          profileId: initIdentity.profileId,
        }),
        "CLI init config identity echo",
      );
    });
    const organizationId = requireConfigIdentity(configIdentity).organizationId;

    await test.step("cli.secrets_set", async () => {
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set",
        redactor,
        stdinInput: sentinel.value,
      });
      recordOutputs("CLI secrets set", { stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI secrets set");
      assertCliSecretWriteEnvelopeMetadataOnly(body, "CLI secrets set", PROOF_VARIABLE_KEY);
    });

    await test.step("cli.secrets_set_generated", async () => {
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetGenerateArgs({ variableKey: GENERATED_SECRET_VARIABLE_KEY }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set generated",
        redactor,
      });
      recordOutputs("CLI secrets set generated", { stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI secrets set generated");
      assertCliSecretWriteEnvelopeMetadataOnly(
        body,
        "CLI secrets set generated",
        GENERATED_SECRET_VARIABLE_KEY,
      );
    });

    await test.step("cli.secrets_set_human_output", async () => {
      // Human mode is the copyable First Value surface; its stdout must carry
      // the metadata echo (key + no value) and nothing secret-shaped. The
      // generated value is never known to the harness, so the secret-shaped
      // token scan is what proves it did not print.
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetGenerateArgs({
          variableKey: HUMAN_GENERATED_SECRET_VARIABLE_KEY,
        }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        json: false,
        label: "CLI secrets set human",
        redactor,
      });
      recordOutputs("CLI secrets set human", { stderr, stdout }, workspacePathTokens);
      assertCliHumanOutputMetadataOnly({
        label: "CLI secrets set",
        stdout,
        stderr,
        redactor,
        forbiddenMaterials: [bearerMaterial],
        allowedTokens: workspacePathTokens,
        requiredStdoutSubstrings: [`Wrote secret ${HUMAN_GENERATED_SECRET_VARIABLE_KEY}`],
      });
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
      recordOutputs("CLI secrets set empty rejected", result);
      if (result.exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set empty rejected exited ${String(result.exitCode)}`);
      }
      assertCliErrorCode(result, SECRET_EMPTY_VALUE_ERROR, "CLI secrets set empty rejected");
    });

    await test.step("cli.secrets_set_empty_allow_empty", async () => {
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliSecretsSetValueStdinArgs(EMPTY_SECRET_VARIABLE_KEY, { allowEmpty: true }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI secrets set empty allow-empty",
        redactor,
        stdinInput: "",
      });
      recordOutputs("CLI secrets set empty allow-empty", { stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI secrets set empty allow-empty");
      assertCliSecretWriteEnvelopeMetadataOnly(
        body,
        "CLI secrets set empty allow-empty",
        EMPTY_SECRET_VARIABLE_KEY,
      );
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
      recordOutputs("CLI secrets set oversized generated", result);
      if (result.exitCode !== EXIT_VALIDATION) {
        throw new Error(`CLI secrets set oversized generated exited ${String(result.exitCode)}`);
      }
      assertCliErrorCode(
        result,
        SECRET_VALUE_TOO_LARGE_ERROR,
        "CLI secrets set oversized generated",
      );
    });

    const humanRunMarkers = mintRuntimeRunMarkers();
    await test.step("cli.run_human_output", async () => {
      // In human mode `insecur run` passes child stdout through the CLI's
      // stdout and closes with a metadata-only summary line.
      const { stderr, stdout } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        args: buildCliRuntimeInvariantRunArgs({
          absentVariableKey: GENERATED_SECRET_VARIABLE_KEY,
          childScript: RUNTIME_RUN_CHILD_SCRIPT,
          ...humanRunMarkers,
        }),
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        json: false,
        label: "CLI run human",
        redactor,
      });
      const allowedTokens = [
        humanRunMarkers.stdoutMarker,
        humanRunMarkers.stderrMarker,
        RUNTIME_RUN_PROOF,
        ...workspacePathTokens,
      ];
      recordOutputs("CLI run human", { stderr, stdout }, allowedTokens);
      assertCliHumanOutputMetadataOnly({
        label: "CLI run",
        stdout,
        stderr,
        redactor,
        forbiddenMaterials: [bearerMaterial],
        allowedTokens,
        requiredStdoutSubstrings: [humanRunMarkers.stdoutMarker, "Injected"],
      });
      if (!stderr.includes(humanRunMarkers.stderrMarker)) {
        throw new Error("CLI run human child stderr marker was not passed through");
      }
    });

    await test.step("cli.run_first_value_runtime_invariants", async () => {
      const firstRun = await runRuntimeInvariantProbe({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI run first",
        recordOutputs,
        redactor,
      });
      const secondRun = await runRuntimeInvariantProbe({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        label: "CLI run second",
        recordOutputs,
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
          humanRunMarkers.stdoutMarker,
          humanRunMarkers.stderrMarker,
          RUNTIME_RUN_PROOF,
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

    await test.step("cli.config_and_output_surfaces_metadata_only", async () => {
      // Final no-reveal sweep over every persisted config surface and every
      // captured output surface, now that all sensitive material is known:
      // secret writes and runs must not have widened the config files, and no
      // surface may carry bearer, sentinel, or machine root key material.
      const surfaces = await readCliConfigSurfaces(workspace);
      const finalIdentity = assertCliConfigSurfacesMetadataOnly({
        surfaces,
        label: "CLI final config files",
        apiBaseUrl: preview.apiBaseUrl,
        redactor,
        forbiddenMaterials: [bearerMaterial],
      });
      assertEqual(
        JSON.stringify(finalIdentity),
        JSON.stringify(requireConfigIdentity(configIdentity)),
        "CLI final config identity unchanged",
      );
      const outputMaterials = [
        bearerMaterial,
        ...(surfaces.machineRootKeyMaterial === undefined ? [] : [surfaces.machineRootKeyMaterial]),
      ];
      const checkedOutputSurfaces = assertRecordedCliOutputsMetadataOnly({
        surfaces: outputSurfaces,
        redactor,
        forbiddenMaterials: outputMaterials,
        allowedTokens: workspacePathTokens,
      });
      const report = {
        checkedConfigSurfaces: [
          ...surfaces.configDirFiles.map((file) => `configDir/${file}`),
          ...surfaces.configHomeFiles.map((file) => `configHome/${file}`),
        ],
        checkedOutputSurfaces,
        machineRootKeyFilePresent: surfaces.machineRootKeyMaterial !== undefined,
      };
      await test.info().attach("cli-metadata-only-surfaces", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      test.info().annotations.push({
        type: "cli.metadata_only_surfaces",
        description: `config=${String(report.checkedConfigSurfaces.length)} output=${String(checkedOutputSurfaces.length)} machine_root_key_file=${String(report.machineRootKeyFilePresent)}`,
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

function requireConfigIdentity(
  identity: CliFirstValueConfigIdentity | undefined,
): CliFirstValueConfigIdentity {
  if (identity === undefined) {
    throw new Error("CLI init did not produce a config identity");
  }
  return identity;
}

async function runRuntimeInvariantProbe(input: {
  readonly apiBaseUrl: string;
  readonly bearer: string;
  readonly configDir: string;
  readonly configHomeDir: string;
  readonly label: string;
  readonly recordOutputs: (
    name: string,
    channels: { readonly stdout: string; readonly stderr: string },
    allowedTokens?: readonly string[],
  ) => void;
  readonly redactor: (value: unknown) => string;
}): Promise<RuntimeRunProbeResult> {
  const { stderrMarker, stdoutMarker } = mintRuntimeRunMarkers();
  const { stderr, stdout } = await runCliSmokeCommand({
    apiBaseUrl: input.apiBaseUrl,
    args: buildCliRuntimeInvariantRunArgs({
      absentVariableKey: GENERATED_SECRET_VARIABLE_KEY,
      childScript: RUNTIME_RUN_CHILD_SCRIPT,
      stderrMarker,
      stdoutMarker,
    }),
    bearer: input.bearer,
    configDir: input.configDir,
    configHomeDir: input.configHomeDir,
    label: input.label,
    redactor: input.redactor,
  });
  input.recordOutputs(input.label, { stderr, stdout }, [stdoutMarker, stderrMarker]);
  // With `--json`, `insecur run` keeps stdout a pure control channel and
  // routes child stdout to the CLI's stderr verbatim (product-spec.md §Product
  // Surface: "Child output is separated from control output in JSON mode";
  // stream detail in docs/cli-and-sync.md, INS-590). The child still owns its
  // output; insecur never captures or stores it.
  if (stdout.includes(stdoutMarker)) {
    throw new Error(`${input.label} leaked child stdout into the JSON control channel`);
  }
  if (!stderr.includes(stdoutMarker)) {
    throw new Error(`${input.label} child stdout marker was not passed through on stderr`);
  }
  if (!stderr.includes(stderrMarker)) {
    throw new Error(`${input.label} child stderr marker was not passed through`);
  }

  const body = parseCliSmokeJson(stdout, input.label);
  const { grantId } = assertCliRunEnvelopeMetadataOnly(body, input.label, PROOF_VARIABLE_KEY);
  assertCliRunChildExitCode(body, input.label);
  assertEnvelopeDoesNotPersistChildOutput(body, input.label, [stdoutMarker, stderrMarker]);

  const childProof = parseCliRunChildProof(stderr, input.label);
  assertRuntimeInvariantProof(childProof, input.label);
  return { grantId, stderrMarker, stdoutMarker };
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
