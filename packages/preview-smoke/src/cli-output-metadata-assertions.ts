import { assertMetadataOnlyEnvelopeShape, OPAQUE_RESOURCE_ID_PATTERN } from "@insecur/domain";

import { asRecord, assertEqual, requireString, type JsonRecord } from "./http";
import type { CliFirstValueConfigIdentity } from "./cli-config-metadata-assertions";
import {
  assertExactKeys,
  assertJsonTreeMetadataOnly,
  assertOpaqueIdWithPrefix,
  assertSafeDisplayLabel,
  assertSurfaceTextMetadataOnly,
  type SensitiveMaterial,
} from "./cli-metadata-only-scan";

/**
 * INS-368: positive structural assertions on the First Value CLI output
 * surfaces — the `--json` control envelopes and human-mode stdout/stderr for
 * `insecur init`, `insecur secrets set`, and `insecur run` — proving the
 * copyable flow prints opaque-id metadata only, never Sensitive Values or
 * bearer material.
 */

const PROJECT_CONFIG_FILE = ".insecur.json";
const VARIABLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const ENVELOPE_TOP_LEVEL_KEYS = {
  required: ["ok", "data"],
  optional: ["schemaVersion", "meta", "next"],
} as const;

function assertCliSuccessEnvelopeMetadataOnly(
  body: JsonRecord,
  label: string,
  allowedTokens: readonly string[] = [],
): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertExactKeys(body, ENVELOPE_TOP_LEVEL_KEYS, label);
  assertEqual(body.ok, true, `${label} ok`);
  assertJsonTreeMetadataOnly(body, label, allowedTokens);
  return asRecord(body.data, `${label} data`);
}

export interface CliInitEnvelopeIdentity extends CliFirstValueConfigIdentity {
  readonly configPath: string;
}

/** `insecur init --json` data is the config path plus opaque ids and a slug; nothing else. */
export function assertCliInitEnvelopeMetadataOnly(
  body: JsonRecord,
  label: string,
): CliInitEnvelopeIdentity {
  const data = assertCliSuccessEnvelopeMetadataOnly(body, label);
  assertExactKeys(
    data,
    {
      required: [
        "configPath",
        "organizationId",
        "projectId",
        "environmentId",
        "profileId",
        "profileSlug",
      ],
    },
    `${label} data`,
  );
  const configPath = requireString(data.configPath, `${label} configPath`);
  if (!configPath.endsWith(PROJECT_CONFIG_FILE)) {
    throw new Error(`${label} configPath must point at ${PROJECT_CONFIG_FILE}`);
  }
  assertSafeDisplayLabel(data.profileSlug, `${label} profileSlug`);
  return {
    configPath,
    organizationId: assertOpaqueIdWithPrefix(data.organizationId, "org", `${label} organizationId`),
    projectId: assertOpaqueIdWithPrefix(data.projectId, "prj", `${label} projectId`),
    environmentId: assertOpaqueIdWithPrefix(data.environmentId, "env", `${label} environmentId`),
    profileId: assertOpaqueIdWithPrefix(data.profileId, "prof", `${label} profileId`),
  };
}

function assertOptionalAuditEventId(data: JsonRecord, label: string): void {
  if (data.auditEventId === undefined) {
    return;
  }
  const raw = requireString(data.auditEventId, `${label} auditEventId`);
  if (!OPAQUE_RESOURCE_ID_PATTERN.test(raw)) {
    throw new Error(`${label} auditEventId must be an opaque resource id`);
  }
}

function assertVariableKeyEcho(data: JsonRecord, expected: string, label: string): void {
  const variableKey = requireString(data.variableKey, `${label} variableKey`);
  if (!VARIABLE_KEY_PATTERN.test(variableKey)) {
    throw new Error(`${label} variableKey is not an env-var-shaped key`);
  }
  assertEqual(variableKey, expected, `${label} variableKey`);
}

/** `insecur secrets set --json` data echoes ids and the key; never value material. */
export function assertCliSecretWriteEnvelopeMetadataOnly(
  body: JsonRecord,
  label: string,
  expectedVariableKey: string,
): { readonly secretId: string; readonly secretVersionId: string } {
  const data = assertCliSuccessEnvelopeMetadataOnly(body, label);
  assertExactKeys(
    data,
    {
      required: ["secretId", "secretVersionId", "variableKey", "createdSecretShape"],
      optional: ["auditEventId"],
    },
    `${label} data`,
  );
  assertVariableKeyEcho(data, expectedVariableKey, label);
  if (typeof data.createdSecretShape !== "boolean") {
    throw new Error(`${label} createdSecretShape must be a boolean`);
  }
  assertOptionalAuditEventId(data, label);
  return {
    secretId: assertOpaqueIdWithPrefix(data.secretId, "sec", `${label} secretId`),
    secretVersionId: assertOpaqueIdWithPrefix(
      data.secretVersionId,
      "sv",
      `${label} secretVersionId`,
    ),
  };
}

/** `insecur run --json` data is grant/secret ids plus the child exit; never child output or values. */
export function assertCliRunEnvelopeMetadataOnly(
  body: JsonRecord,
  label: string,
  expectedVariableKey: string,
): { readonly grantId: string } {
  const data = assertCliSuccessEnvelopeMetadataOnly(body, label);
  assertExactKeys(
    data,
    {
      required: [
        "grantId",
        "variableKey",
        "secretId",
        "secretVersionId",
        "exitSource",
        "childExitCode",
      ],
      optional: ["auditEventId"],
    },
    `${label} data`,
  );
  assertVariableKeyEcho(data, expectedVariableKey, label);
  assertOpaqueIdWithPrefix(data.secretId, "sec", `${label} secretId`);
  assertOpaqueIdWithPrefix(data.secretVersionId, "sv", `${label} secretVersionId`);
  assertEqual(data.exitSource, "child", `${label} exitSource`);
  if (typeof data.childExitCode !== "number") {
    throw new Error(`${label} childExitCode must be a number`);
  }
  assertOptionalAuditEventId(data, label);
  return { grantId: assertOpaqueIdWithPrefix(data.grantId, "igr", `${label} grantId`) };
}

export interface CliHumanOutputAssertionInput {
  readonly label: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly redactor: (value: unknown) => string;
  readonly forbiddenMaterials?: readonly SensitiveMaterial[];
  readonly allowedTokens?: readonly string[];
  /** Positive shape: metadata the human line MUST mention (key echo, id, ...). */
  readonly requiredStdoutSubstrings?: readonly string[];
}

/** Human-mode stdout/stderr carry the expected metadata and nothing secret-shaped. */
export function assertCliHumanOutputMetadataOnly(input: CliHumanOutputAssertionInput): void {
  for (const [channel, text] of [
    ["stdout", input.stdout],
    ["stderr", input.stderr],
  ] as const) {
    assertSurfaceTextMetadataOnly({
      label: `${input.label} human ${channel}`,
      text,
      redactor: input.redactor,
      ...(input.forbiddenMaterials === undefined
        ? {}
        : { forbiddenMaterials: input.forbiddenMaterials }),
      ...(input.allowedTokens === undefined ? {} : { allowedTokens: input.allowedTokens }),
    });
  }
  for (const expected of input.requiredStdoutSubstrings ?? []) {
    if (!input.stdout.includes(expected)) {
      throw new Error(`${input.label} human stdout is missing expected metadata: ${expected}`);
    }
  }
}

export interface RecordedCliOutputSurface {
  readonly name: string;
  readonly text: string;
  readonly allowedTokens?: readonly string[];
}

/**
 * Re-scans every captured CLI output surface once all sensitive material is
 * known (the file-fallback machine root key may only exist after the first
 * CLI call), then returns the checked surface names for the smoke artifact
 * report.
 */
export function assertRecordedCliOutputsMetadataOnly(input: {
  readonly surfaces: readonly RecordedCliOutputSurface[];
  readonly redactor: (value: unknown) => string;
  readonly forbiddenMaterials: readonly SensitiveMaterial[];
}): readonly string[] {
  for (const surface of input.surfaces) {
    assertSurfaceTextMetadataOnly({
      label: surface.name,
      text: surface.text,
      redactor: input.redactor,
      forbiddenMaterials: input.forbiddenMaterials,
      ...(surface.allowedTokens === undefined ? {} : { allowedTokens: surface.allowedTokens }),
    });
  }
  return input.surfaces.map((surface) => surface.name);
}
