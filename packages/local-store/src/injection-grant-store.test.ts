import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  brandValue,
  environmentId,
  injectionGrantId,
  projectId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalStoreForTest } from "./create-local-store.js";
import { createFakeKeyStore, generateMachineRootKeyHex } from "./index.js";
import { openLocalSqliteDatabase } from "./sqlite/connection.js";
import type { LocalStore } from "./create-local-store.js";

const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");
const SECRET_B = secretId.brand("sec_01JZ8E9C0I4S8O2U7W9X1Y3Z5B");
const VERSION_A = secretVersionId.brand("sv_01TEST00000000000000000001");
const GRANT_A = injectionGrantId.brand("igr_01TEST00000000000000000001");
const GRANT_B = injectionGrantId.brand("igr_01TEST00000000000000000002");
const VARIABLE_KEY = brandValue<string, "VariableKey">("INSECUR_PROOF_SECRET");
const OTHER_VARIABLE_KEY = brandValue<string, "VariableKey">("OTHER_SECRET");

interface GrantTestContext {
  tempDir: string;
  databasePath: string;
  store: LocalStore;
}

function createGrantTestContext(): GrantTestContext {
  const tempDir = mkdtempSync(path.join(tmpdir(), "insecur-injection-grant-test-"));
  const databasePath = path.join(tempDir, "local-store.sqlite");
  const database = openLocalSqliteDatabase(databasePath);
  const store = createLocalStoreForTest({
    keyStore: createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
    database,
    paths: {
      userConfigDir: tempDir,
      machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
      machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
      databaseFilePath: databasePath,
    },
  });
  return { tempDir, databasePath, store };
}

async function seedProject(store: LocalStore): Promise<void> {
  await store.projects.createProject(PROJECT_A, "Local project");
  await store.projects.createEnvironment(PROJECT_A, ENV_A, "development");
}

async function insertGrant(
  store: LocalStore,
  grantIdValue: typeof GRANT_A,
  expiresAt: Date,
): Promise<void> {
  await store.injectionGrants.insertGrant({
    grantId: grantIdValue,
    projectId: PROJECT_A,
    environmentId: ENV_A,
    bindings: [
      {
        secretId: SECRET_A,
        secretVersionId: VERSION_A,
        variableKey: VARIABLE_KEY,
      },
    ],
    expiresAt,
  });
}

describe("store.injectionGrants", () => {
  let context: GrantTestContext;

  beforeEach(() => {
    context = createGrantTestContext();
  });

  afterEach(() => {
    context.store.close();
    rmSync(context.tempDir, { recursive: true, force: true });
  });

  it("insertGrant and tryConsumeGrant succeed on the happy path", async () => {
    await seedProject(context.store);
    await insertGrant(context.store, GRANT_A, new Date(Date.now() + 60_000));

    const consumed = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(consumed).toEqual({
      ok: true,
      grant: {
        grantId: GRANT_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        secretId: SECRET_A,
        secretVersionId: VERSION_A,
        variableKey: VARIABLE_KEY,
      },
    });
  });

  it("tryConsumeGrant rejects expired grants", async () => {
    await seedProject(context.store);
    await insertGrant(context.store, GRANT_A, new Date(Date.now() - 1_000));

    const consumed = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(consumed).toEqual({ ok: false, failure: "expired" });
  });

  it("tryConsumeGrant rejects already-consumed grants", async () => {
    await seedProject(context.store);
    await insertGrant(context.store, GRANT_A, new Date(Date.now() + 60_000));

    const first = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(first.ok).toBe(true);

    const second = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(second).toEqual({ ok: false, failure: "already_consumed" });
  });

  it("tryConsumeGrant rejects binding mismatches for secret id and variable key", async () => {
    await seedProject(context.store);
    await insertGrant(context.store, GRANT_A, new Date(Date.now() + 60_000));

    const wrongSecret = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_B,
      VARIABLE_KEY,
    );
    expect(wrongSecret).toEqual({ ok: false, failure: "binding_not_allowed" });

    const wrongVariable = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      OTHER_VARIABLE_KEY,
    );
    expect(wrongVariable).toEqual({ ok: false, failure: "binding_not_allowed" });
  });

  it("tryConsumeGrant rejects unknown grants", async () => {
    await seedProject(context.store);

    const consumed = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_B,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(consumed).toEqual({ ok: false, failure: "not_found" });
  });

  it("serializes one-use claim across separate sqlite connections", async () => {
    await seedProject(context.store);
    await insertGrant(context.store, GRANT_A, new Date(Date.now() + 60_000));

    const first = await context.store.injectionGrants.tryConsumeGrant(
      PROJECT_A,
      GRANT_A,
      SECRET_A,
      VARIABLE_KEY,
    );
    expect(first.ok).toBe(true);

    const peerDatabase = openLocalSqliteDatabase(context.databasePath);
    const peerStore = createLocalStoreForTest({
      keyStore: createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
      database: peerDatabase,
    });
    try {
      const second = await peerStore.injectionGrants.tryConsumeGrant(
        PROJECT_A,
        GRANT_A,
        SECRET_A,
        VARIABLE_KEY,
      );
      expect(second).toEqual({ ok: false, failure: "already_consumed" });
    } finally {
      peerStore.close();
    }
  });
});
