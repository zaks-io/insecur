import { brandValue, bytesToBase64Url, environmentId, projectId, secretId } from "@insecur/domain";
import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakeKeyStore, generateMachineRootKeyHex } from "./index.js";
import { createLocalStoreForTest } from "./create-local-store.js";
import { LOCAL_MODE_ORGANIZATION_ID } from "./crypto/local-organization.js";
import { openLocalSqliteDatabase } from "./sqlite/connection.js";
import { writeLocalBlindSecretVersion } from "./write-local-blind-secret-version.js";
import type { LocalStore } from "./create-local-store.js";

const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VARIABLE_KEY = brandValue<string, "VariableKey">("INSECUR_PROOF_SECRET");

describe("local write-time descriptive verdicts", () => {
  let tempDir: string;
  let store: LocalStore;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "insecur-local-verdicts-"));
    const databasePath = path.join(tempDir, "local-store.sqlite");
    store = createLocalStoreForTest({
      keyStore: createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
      database: openLocalSqliteDatabase(databasePath),
      paths: {
        userConfigDir: tempDir,
        machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
        machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
        databaseFilePath: databasePath,
      },
    });
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores verdicts on write and serves them from metadata list without decrypt", async () => {
    await store.projects.createProject(PROJECT, "Local project");
    await store.projects.createEnvironment(PROJECT, ENV, "development");
    await store.projects.upsertSecretShape({
      projectId: PROJECT,
      variableKey: VARIABLE_KEY,
      secretId: SECRET,
      generationHint: "random:32",
    });

    const valueUtf8 = new TextEncoder().encode(
      `${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))}\n`,
    );
    const expected = computeSecretWriteDescriptiveVerdicts({
      valueUtf8,
      generationHint: "random:32",
    });

    const written = await writeLocalBlindSecretVersion(
      { secretVersions: store.secretVersions, projectMetadata: store.projects },
      {
        keyring: store.keyring,
        ciphertextIdentity: {
          organizationId: LOCAL_MODE_ORGANIZATION_ID,
          projectId: PROJECT,
          environmentId: ENV,
          secretId: SECRET,
        },
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
        variableKey: VARIABLE_KEY,
        valueUtf8,
      },
    );

    expect(written.descriptiveVerdicts).toEqual(expected);
    expect(expected.hasLeadingOrTrailingWhitespace).toBe(true);
    expect(expected.secretShapeMatchVerdict).toBe("does_not_match");

    const listed = await store.secretVersions.listSecretMetadata(PROJECT, ENV);
    expect(listed[0]?.descriptiveVerdicts).toEqual(expected);
    expect(JSON.stringify(listed)).not.toMatch(/ciphertext|plaintext|digest|hash|similarity/i);
  });
});
