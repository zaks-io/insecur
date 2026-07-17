import { APP_CONNECTION_ERROR_CODES, assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";
import {
  assertExactKeys,
  assertJsonTreeMetadataOnly,
  assertOpaqueIdWithPrefix,
  assertSafeDisplayLabel,
} from "./cli-metadata-only-scan.js";
import { requireObjectArray } from "./metadata-read-assertions.js";
import { parseLastCliSmokeJson } from "./cli-smoke.js";

/**
 * `MetadataSafeAppConnectionListItem` is the ONLY shape an App Connection may
 * take on any surface the CLI prints. Every field here is metadata; none is a
 * provider token, OAuth code, scoped credential, or boundary secret. The exact
 * key allowlist fails loudly the moment a new field widens this surface, so a
 * future credential-bearing field cannot silently reach CLI stdout.
 */
const APP_CONNECTION_LIST_ITEM_KEYS = {
  required: [
    "id",
    "organizationId",
    "provider",
    "connectionMethod",
    "displayName",
    "status",
    "statusReasonCode",
    "hasActiveCredential",
    "setupUserId",
    "lastValidationCheckedAt",
    "lastValidationOutcome",
    "lastValidationReasonCode",
    "createdAt",
    "updatedAt",
  ],
} as const;

function assertAppConnectionListItemMetadataOnly(
  connection: JsonRecord,
  label: string,
  expectedOrganizationId: string,
): void {
  assertExactKeys(connection, APP_CONNECTION_LIST_ITEM_KEYS, label);
  assertJsonTreeMetadataOnly(connection, label);
  assertOpaqueIdWithPrefix(connection.id, "conn", `${label} id`);
  assertEqual(connection.organizationId, expectedOrganizationId, `${label} organizationId`);
  assertSafeDisplayLabel(connection.displayName, `${label} displayName`);
  requireString(connection.provider, `${label} provider`);
  requireString(connection.connectionMethod, `${label} connectionMethod`);
  requireString(connection.status, `${label} status`);
  if (typeof connection.hasActiveCredential !== "boolean") {
    throw new Error(`${label} hasActiveCredential must be a boolean`);
  }
}

/**
 * Asserts `connections list --json` returned a metadata-only success envelope
 * scoped to the smoke organization, with every connection carrying only the
 * metadata-safe list-item shape. Returns the connection rows for the caller.
 */
export function assertCliConnectionsListMetadataOnly(
  body: JsonRecord,
  label: string,
  expectedOrganizationId: string,
): JsonRecord[] {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  const connections = requireObjectArray(data.connections, `${label} connections`);
  for (const [index, connection] of connections.entries()) {
    assertAppConnectionListItemMetadataOnly(
      connection,
      `${label} connections[${String(index)}]`,
      expectedOrganizationId,
    );
  }
  return connections;
}

/** Exit code the CLI returns for `connection.not_found` (see cli exit-codes: EXIT_NOT_FOUND). */
export const CLI_CONNECTION_NOT_FOUND_EXIT_CODE = 5;

/**
 * A `connections status <opaque-but-nonexistent-id>` call is the credential-free
 * non-list path this smoke exercises: it drives the real deployed
 * `GET /v1/orgs/:organizationId/connections/:connectionId` route, resolves
 * inside the smoke organization's tenant boundary, and must return the stable
 * `connection.not_found` error envelope on stderr with exit code 5. The error
 * envelope is metadata-only and reveals nothing about any provider credential.
 */
export function assertCliConnectionStatusNotFound(input: {
  readonly exitCode: number;
  readonly label: string;
  readonly stderr: string;
  readonly stdout: string;
}): void {
  if (input.stdout.trim() !== "") {
    throw new Error(`${input.label} must not write success JSON to stdout for a not-found status`);
  }

  const trimmedStderr = input.stderr.trim();
  if (trimmedStderr === "") {
    throw new Error(`${input.label} produced no JSON error output on stderr`);
  }
  const body = parseLastCliSmokeJson(trimmedStderr, input.label);
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, false, `${input.label} ok`);
  const error = asRecord(body.error, `${input.label} error`);
  assertEqual(error.code, APP_CONNECTION_ERROR_CODES.notFound, `${input.label} error.code`);
  assertJsonTreeMetadataOnly(body, `${input.label} envelope`);
  if (input.exitCode !== CLI_CONNECTION_NOT_FOUND_EXIT_CODE) {
    throw new Error(
      `${input.label} expected exit code ${String(CLI_CONNECTION_NOT_FOUND_EXIT_CODE)}, got ${String(input.exitCode)}`,
    );
  }
}
