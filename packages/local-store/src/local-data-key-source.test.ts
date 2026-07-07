import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { projectId } from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LOCAL_MODE_ORGANIZATION_ID } from "./crypto/local-organization.js";
import { PersistingLocalDataKeySource } from "./crypto/local-data-key-source.js";
import { MachineRootKeyProvider } from "./crypto/machine-root-key-provider.js";
import { createFakeKeyStore, generateMachineRootKeyHex } from "./index.js";
import { openLocalSqliteDatabase } from "./sqlite/connection.js";
import { SqliteLocalDataKeyPersistence } from "./stores/sqlite/data-key-persistence.js";

const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");

describe("local data key persistence", () => {
  let tempDir: string;
  let databasePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "insecur-data-key-test-"));
    databasePath = path.join(tempDir, "local-store.sqlite");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns the first persisted organization data key ref when INSERT OR IGNORE races", () => {
    const database = openLocalSqliteDatabase(databasePath);
    const persistence = new SqliteLocalDataKeyPersistence(database);
    try {
      const firstRef = persistence.saveOrganizationDataKey({
        organizationDataKeyVersion: 1,
        rootKeyVersion: 1,
        wrappedStorageRef: "org-ref-first",
      });
      const secondRef = persistence.saveOrganizationDataKey({
        organizationDataKeyVersion: 1,
        rootKeyVersion: 1,
        wrappedStorageRef: "org-ref-second",
      });
      expect(firstRef).toBe("org-ref-first");
      expect(secondRef).toBe("org-ref-first");
    } finally {
      database.close();
    }
  });

  it("returns the first persisted project data key ref when INSERT OR IGNORE races", () => {
    const database = openLocalSqliteDatabase(databasePath);
    database
      .prepare(`INSERT INTO projects (id, display_name, created_at) VALUES (?, ?, ?)`)
      .run(PROJECT_A, null, new Date().toISOString());
    const persistence = new SqliteLocalDataKeyPersistence(database);
    try {
      const firstRef = persistence.saveProjectDataKey({
        projectId: PROJECT_A,
        projectDataKeyVersion: 1,
        rootKeyVersion: 1,
        wrappedStorageRef: "project-ref-first",
      });
      const secondRef = persistence.saveProjectDataKey({
        projectId: PROJECT_A,
        projectDataKeyVersion: 1,
        rootKeyVersion: 1,
        wrappedStorageRef: "project-ref-second",
      });
      expect(firstRef).toBe("project-ref-first");
      expect(secondRef).toBe("project-ref-first");
    } finally {
      database.close();
    }
  });

  it("ensureProjectDataKey callers observe the same wrapped ref after parallel mint attempts", async () => {
    const database = openLocalSqliteDatabase(databasePath);
    database
      .prepare(`INSERT INTO projects (id, display_name, created_at) VALUES (?, ?, ?)`)
      .run(PROJECT_A, null, new Date().toISOString());
    const persistence = new SqliteLocalDataKeyPersistence(database);
    const rootKeyProvider = new MachineRootKeyProvider(
      createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
    );
    const dataKeySource = new PersistingLocalDataKeySource(rootKeyProvider, persistence);
    try {
      const [firstRef, secondRef] = await Promise.all([
        dataKeySource.getProjectWrappedStorageRef(LOCAL_MODE_ORGANIZATION_ID, PROJECT_A, 1, 1),
        dataKeySource.getProjectWrappedStorageRef(LOCAL_MODE_ORGANIZATION_ID, PROJECT_A, 1, 1),
      ]);
      expect(firstRef).toBe(secondRef);
      expect(persistence.getProjectDataKey(PROJECT_A, 1)?.wrappedStorageRef).toBe(firstRef);
    } finally {
      database.close();
    }
  });
});
