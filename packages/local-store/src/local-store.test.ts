import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  environmentId,
  projectId,
  secretId,
  secretVersionId,
  brandValue,
  type SecretVersionId,
} from "@insecur/domain";
import type { SecretCiphertextIdentity } from "@insecur/crypto";
import { DecryptError } from "@insecur/crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalStoreForTest } from "./create-local-store.js";
import { decryptLocalSecretForInjection } from "./decrypt-local-secret-for-injection.js";
import { encryptLocalSecretValue } from "./crypto/encrypt-local-secret.js";
import { LOCAL_MODE_ORGANIZATION_ID } from "./crypto/local-organization.js";
import { createFakeKeyStore, generateMachineRootKeyHex } from "./index.js";
import { openLocalSqliteDatabase } from "./sqlite/connection.js";
import { SqliteLocalStore } from "./stores/sqlite-local-store.js";
import type { LocalSecretVersionStore } from "./contracts/secret-version-store.js";
import type { LocalProjectMetadataStore } from "./contracts/project-metadata-store.js";
import type { LocalAuditWriter } from "./contracts/audit-writer.js";

const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");
const SECRET_B = secretId.brand("sec_01JZ8E9C0I4S8O2U7W9X1Y3Z5B");
const VERSION_A = secretVersionId.brand("sv_01TEST00000000000000000001");
const VERSION_B = secretVersionId.brand("sv_01TEST00000000000000000002");

const SENSITIVE_PLAINTEXT = new TextEncoder().encode("local-mode-sensitive-value");
const REPLACED_PLAINTEXT = new TextEncoder().encode("replaced-sensitive-value");

function identity(secretIdValue = SECRET_A): SecretCiphertextIdentity {
  return {
    organizationId: LOCAL_MODE_ORGANIZATION_ID,
    projectId: PROJECT_A,
    environmentId: ENV_A,
    secretId: secretIdValue,
  };
}

interface TestHarness {
  tempDir: string;
  databasePath: string;
  keyHex: string;
  wrongKeyHex: string;
  store: ReturnType<typeof createLocalStoreForTest>;
  sqlite: SqliteLocalStore;
  secretVersions: LocalSecretVersionStore;
  projects: LocalProjectMetadataStore;
  audit: LocalAuditWriter;
}

function createHarness(): TestHarness {
  const tempDir = mkdtempSync(path.join(tmpdir(), "insecur-local-store-test-"));
  const databasePath = path.join(tempDir, "local-store.sqlite");
  const keyHex = generateMachineRootKeyHex();
  const wrongKeyHex = generateMachineRootKeyHex();
  const database = openLocalSqliteDatabase(databasePath);
  const sqlite = new SqliteLocalStore(database);
  const store = createLocalStoreForTest({
    keyStore: createFakeKeyStore({ keyHex }),
    database,
    paths: {
      userConfigDir: tempDir,
      machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
      machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
      databaseFilePath: databasePath,
    },
  });
  return {
    tempDir,
    databasePath,
    keyHex,
    wrongKeyHex,
    store,
    sqlite,
    secretVersions: store.secretVersions,
    projects: store.projects,
    audit: store.audit,
  };
}

async function seedProjectAndEnvironment(harness: TestHarness): Promise<void> {
  await harness.projects.createProject(PROJECT_A, "Local project");
  await harness.projects.createEnvironment(PROJECT_A, ENV_A, "development");
}

async function writeWrappedCurrentVersion(
  harness: TestHarness,
  input: {
    secretIdValue?: typeof SECRET_A;
    secretVersionIdValue: SecretVersionId;
    plaintext: Uint8Array;
    variableKey?: string;
  },
): Promise<void> {
  const secretIdValue = input.secretIdValue ?? SECRET_A;
  const wrapped = await encryptLocalSecretValue(
    harness.store.keyring,
    identity(secretIdValue),
    input.plaintext,
  );
  await harness.secretVersions.replaceCurrentVersion({
    projectId: PROJECT_A,
    environmentId: ENV_A,
    secretId: secretIdValue,
    secretVersionId: input.secretVersionIdValue,
    variableKey: brandValue<string, "VariableKey">(input.variableKey ?? "INSECUR_PROOF_SECRET"),
    wrapped,
  });
}

async function expectDecryptFailure(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toBeInstanceOf(DecryptError);
}

describe("SqliteLocalStore", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.store.close();
    rmSync(harness.tempDir, { recursive: true, force: true });
  });

  it("persists wrapped material only and round-trips through contract interfaces", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });

    const stored = await harness.secretVersions.getCurrentWrappedVersion(PROJECT_A, SECRET_A);
    expect(stored).not.toBeNull();
    if (!stored) {
      throw new Error("expected stored secret version");
    }
    const ciphertextOnDisk = harness.sqlite.readRawCiphertext(SECRET_A);
    expect(ciphertextOnDisk).not.toBeNull();
    const diskText = new TextDecoder().decode(ciphertextOnDisk ?? new Uint8Array());
    expect(diskText).not.toContain(new TextDecoder().decode(SENSITIVE_PLAINTEXT));
    expect(stored.wrapped.ciphertext).toEqual(ciphertextOnDisk);

    const decrypted = await decryptLocalSecretForInjection(
      harness.store.keyring,
      identity(),
      stored.wrapped,
    );
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(SENSITIVE_PLAINTEXT),
    );
  });

  it("replaces the Current Version in one transaction and leaves no previous ciphertext row", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });
    const firstCiphertext = harness.sqlite.readRawCiphertext(SECRET_A);
    expect(harness.sqlite.countCurrentSecretVersionRows()).toBe(1);

    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_B,
      plaintext: REPLACED_PLAINTEXT,
    });

    expect(harness.sqlite.countCurrentSecretVersionRows()).toBe(1);
    const secondCiphertext = harness.sqlite.readRawCiphertext(SECRET_A);
    expect(secondCiphertext).not.toEqual(firstCiphertext);
    const stored = await harness.secretVersions.getCurrentWrappedVersion(PROJECT_A, SECRET_A);
    expect(stored?.secretVersionId).toBe(VERSION_B);
  });

  it("fails decrypt when ciphertext identity binding does not match the requested secret id", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });
    const stored = await harness.secretVersions.getCurrentWrappedVersion(PROJECT_A, SECRET_A);
    if (!stored) {
      throw new Error("expected stored secret version");
    }
    await expectDecryptFailure(() =>
      decryptLocalSecretForInjection(harness.store.keyring, identity(SECRET_B), stored.wrapped),
    );
  });

  it("cannot decrypt from a copied store directory without the machine root key", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });
    const stored = await harness.secretVersions.getCurrentWrappedVersion(PROJECT_A, SECRET_A);
    if (!stored) {
      throw new Error("expected stored secret version");
    }

    const copiedDir = mkdtempSync(path.join(tmpdir(), "insecur-local-store-copy-"));
    const copiedDatabasePath = path.join(copiedDir, "local-store.sqlite");
    copyFileSync(harness.databasePath, copiedDatabasePath);
    const copiedDatabase = openLocalSqliteDatabase(copiedDatabasePath);
    const copiedStore = createLocalStoreForTest({
      keyStore: createFakeKeyStore({ keyHex: harness.wrongKeyHex }),
      database: copiedDatabase,
    });
    try {
      const copiedWrapped = await copiedStore.secretVersions.getCurrentWrappedVersion(
        PROJECT_A,
        SECRET_A,
      );
      if (!copiedWrapped) {
        throw new Error("expected copied wrapped secret");
      }
      await expectDecryptFailure(() =>
        decryptLocalSecretForInjection(copiedStore.keyring, identity(), copiedWrapped.wrapped),
      );
    } finally {
      copiedStore.close();
      rmSync(copiedDir, { recursive: true, force: true });
    }

    const decrypted = await decryptLocalSecretForInjection(
      harness.store.keyring,
      identity(),
      stored.wrapped,
    );
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(SENSITIVE_PLAINTEXT),
    );
  });

  it("does not persist sensitive plaintext in audit rows after a secret write", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });
    const plaintextLiteral = new TextDecoder().decode(SENSITIVE_PLAINTEXT);
    await harness.audit.writeEvent({
      eventCode: "secret.write.completed",
      outcome: "success",
      projectId: PROJECT_A,
      environmentId: ENV_A,
      secretId: SECRET_A,
      details: { variableKey: "INSECUR_PROOF_SECRET" },
    });
    const auditDetailsRows = harness.sqlite.readAuditDetailsJsonRows();
    expect(auditDetailsRows).toHaveLength(1);
    expect(auditDetailsRows[0]).not.toContain(plaintextLiteral);
    expect(auditDetailsRows.join("")).not.toContain(plaintextLiteral);
  });

  it("does not write plaintext sensitive values into the sqlite file bytes", async () => {
    await seedProjectAndEnvironment(harness);
    await writeWrappedCurrentVersion(harness, {
      secretVersionIdValue: VERSION_A,
      plaintext: SENSITIVE_PLAINTEXT,
    });
    const fileBytes = readFileSync(harness.databasePath);
    const fileText = new TextDecoder().decode(fileBytes);
    expect(fileText).not.toContain(new TextDecoder().decode(SENSITIVE_PLAINTEXT));
  });
});
