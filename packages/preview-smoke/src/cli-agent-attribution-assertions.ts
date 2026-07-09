import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";

const ALLOWED_AGENT_ENV_EXPORT_KEYS = new Set([
  "INSECUR_HOST",
  "INSECUR_AGENT_CREDENTIAL_FILE",
  "INSECUR_AGENT_TAG",
]);

function parseAgentEnvExportLine(line: string, label: string): readonly [string, string] {
  const match = /^export ([A-Z_][A-Z0-9_]*)='(.*)'$/.exec(line);
  if (match === null) {
    throw new Error(`${label} emitted a line that is not a shell export: ${line}`);
  }
  const [, key, quoted] = match;
  if (key === undefined || quoted === undefined) {
    throw new Error(`${label} emitted an unparseable export line: ${line}`);
  }
  if (!ALLOWED_AGENT_ENV_EXPORT_KEYS.has(key)) {
    throw new Error(`${label} exported unexpected key ${key}`);
  }
  return [key, quoted.replaceAll("'\\''", "'")];
}

function parseAgentEnvExports(stdout: string, label: string): Record<string, string> {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    throw new Error(`${label} produced no export lines`);
  }
  return Object.fromEntries(lines.map((line) => parseAgentEnvExportLine(line, label)));
}

/**
 * `insecur agent env` writes `export KEY='value'` lines to stdout (it rejects `--json`, see
 * `runAgentEnvCommand`). Asserts the output is exactly the allowed metadata-only export keys and
 * that the credential file path (a filesystem pointer, not the credential itself) is present.
 */
export function assertCliAgentEnvMetadataOnly(
  stdout: string,
  label: string,
): { readonly host: string; readonly credentialFile: string } {
  const exports = parseAgentEnvExports(stdout, label);
  const host = requireString(exports.INSECUR_HOST, `${label} INSECUR_HOST`);
  const credentialFile = requireString(
    exports.INSECUR_AGENT_CREDENTIAL_FILE,
    `${label} INSECUR_AGENT_CREDENTIAL_FILE`,
  );
  return { host, credentialFile };
}

/** Asserts a successful `insecur agent register --json` envelope and returns its data. */
export function assertCliAgentRegisterMetadataOnly(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  requireString(data.agentSessionId, `${label} data.agentSessionId`);
  requireString(data.harnessName, `${label} data.harnessName`);
  return data;
}

/** Asserts a successful `insecur whoami --json` envelope and returns its `attribution` field. */
export function assertCliWhoamiAttribution(
  body: JsonRecord,
  label: string,
  expectedTier: "derived" | "none" | "registered" | "tag-only",
): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  const attribution = asRecord(data.attribution, `${label} data.attribution`);
  assertEqual(attribution.tier, expectedTier, `${label} data.attribution.tier`);
  return attribution;
}
