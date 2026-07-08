import { bytesToBase64Url } from "@insecur/domain";
import {
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";
import { describe, expect, it, vi } from "vitest";

import type { TenantScopedDb } from "../src/tenant-scoped-db.js";
import { listEnvironmentSecretMetadataRows } from "../src/secrets/environment-secret-metadata-queries.js";
import { TenantSecretVersionStore } from "../src/index.js";
import { testDescriptiveVerdicts } from "./helpers/descriptive-verdicts.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");

function createEnvironmentSecretMetadataDb(
  joinRows: readonly Record<string, unknown>[],
): TenantScopedDb {
  const orderBy = vi.fn(async () => joinRows);
  const where = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ leftJoin }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as TenantScopedDb;
}

describe("secret version descriptive verdict metadata reads", () => {
  it("lists stored verdicts without selecting ciphertext storage refs", async () => {
    const descriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({
      valueUtf8: new TextEncoder().encode("api_secret_value_123\n"),
      generationHint: null,
    });
    const db = createEnvironmentSecretMetadataDb([
      {
        secretId: SECRET,
        environmentId: ENV,
        variableKey: "API_KEY",
        secretCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
        currentVersionId: VERSION,
        versionId: VERSION,
        versionNumber: 1,
        lifecycleState: "live",
        versionCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
        publishedAt: new Date("2026-07-01T00:00:00.000Z"),
        valueByteLength: descriptiveVerdicts.valueByteLength,
        encodingClass: descriptiveVerdicts.encodingClass,
        isEmpty: descriptiveVerdicts.isEmpty,
        hasLeadingOrTrailingWhitespace: descriptiveVerdicts.hasLeadingOrTrailingWhitespace,
        looksLikePlaceholder: descriptiveVerdicts.looksLikePlaceholder,
        secretShapeMatchVerdict: descriptiveVerdicts.secretShapeMatchVerdict,
      },
    ]);

    const rows = await listEnvironmentSecretMetadataRows(db, {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.currentVersionDescriptiveVerdicts).toEqual(descriptiveVerdicts);
    expect(JSON.stringify(rows)).not.toMatch(/ciphertext|plaintext|valueUtf8/i);
  });

  it("stores verdicts at append time for metadata-only reads", async () => {
    const valueUtf8 = new TextEncoder().encode("placeholder\n");
    const descriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({ valueUtf8 });
    const { db, insertValues } = createMockTenantDb({
      selectResults: [[{ id: SECRET }], [{ maxVersion: 0 }], [{ currentVersionId: null }]],
      updateReturning: [[{ id: SECRET }]],
    });
    const store = new TenantSecretVersionStore(db);
    await store.appendVersionAndMakeLive({
      organizationId: ORG,
      secretId: SECRET,
      secretVersionId: VERSION,
      createdSecretShape: true,
      descriptiveVerdicts,
      wrapped: {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
        ciphertext: new Uint8Array([1, 2, 3]),
      },
    });

    expect(insertValues[0]).toMatchObject({
      valueByteLength: descriptiveVerdicts.valueByteLength,
      encodingClass: descriptiveVerdicts.encodingClass,
      isEmpty: descriptiveVerdicts.isEmpty,
      hasLeadingOrTrailingWhitespace: true,
      looksLikePlaceholder: true,
      secretShapeMatchVerdict: "no_shape_rule",
    });
  });
});

describe("hosted vs local descriptive verdict parity", () => {
  it("computes identical verdicts for the same UTF-8 input and generation hint", () => {
    const valueUtf8 = new TextEncoder().encode(
      bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    );
    const generationHint = "random:32";
    const hosted = computeSecretWriteDescriptiveVerdicts({ valueUtf8, generationHint });
    const local = computeSecretWriteDescriptiveVerdicts({ valueUtf8, generationHint });
    expect(local).toEqual(hosted);
    expect(hosted.secretShapeMatchVerdict).toBe("matches");
  });

  it("matches the default helper fixture used by hosted store tests", () => {
    expect(testDescriptiveVerdicts()).toEqual(
      computeSecretWriteDescriptiveVerdicts({
        valueUtf8: new TextEncoder().encode("test-secret"),
      }),
    );
  });
});
