import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  persistOrganizationDataKeyAuthoritative,
  persistProjectDataKeyAuthoritative,
} from "../src/data-keys/data-key-mint-persist.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";
import type {
  SeedOrganizationDataKeyInput,
  SeedProjectDataKeyInput,
} from "../src/data-keys/types.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");

// Records every `db.execute` so a test can assert the mint-once advisory lock fired before any read.
class RecordingDb {
  readonly executed: unknown[] = [];
  execute(query: unknown): Promise<void> {
    this.executed.push(query);
    return Promise.resolve();
  }
}

function recordingDb(): { db: TenantScopedDb; executed: unknown[] } {
  const recorder = new RecordingDb();
  return { db: recorder as unknown as TenantScopedDb, executed: recorder.executed };
}

class InMemoryMintStore {
  private organizationRows = new Map<string, SeedOrganizationDataKeyInput & { status: "active" }>();
  private projectRows = new Map<string, SeedProjectDataKeyInput & { status: "active" }>();

  getOrganizationDataKeyVersion(organizationId: typeof ORG, keyVersion: number) {
    const row = this.organizationRows.get(`${organizationId}:${String(keyVersion)}`);
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      id: row.id,
      organizationId: row.organizationId,
      keyVersion: row.keyVersion,
      status: row.status,
      rootKeyVersion: row.rootKeyVersion ?? 1,
      wrappedStorageRef: row.wrappedStorageRef ?? null,
      custodyEvidenceRef: null,
    });
  }

  insertOrganizationDataKey(input: SeedOrganizationDataKeyInput): Promise<void> {
    const key = `${input.organizationId}:${String(input.keyVersion)}`;
    if (!this.organizationRows.has(key)) {
      this.organizationRows.set(key, { ...input, status: input.status ?? "active" });
    }
    return Promise.resolve();
  }

  getProjectDataKeyVersion(
    organizationId: typeof ORG,
    projectId: typeof PROJECT,
    keyVersion: number,
  ) {
    const row = this.projectRows.get(`${organizationId}:${projectId}:${String(keyVersion)}`);
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      keyVersion: row.keyVersion,
      status: row.status,
      organizationDataKeyVersion: row.organizationDataKeyVersion,
      wrappedStorageRef: row.wrappedStorageRef ?? null,
    });
  }

  insertProjectDataKey(input: SeedProjectDataKeyInput): Promise<void> {
    const key = `${input.organizationId}:${input.projectId}:${String(input.keyVersion)}`;
    if (!this.projectRows.has(key)) {
      this.projectRows.set(key, { ...input, status: input.status ?? "active" });
    }
    return Promise.resolve();
  }
}

describe("data-key mint persist", () => {
  it("returns an existing organization wrapped ref without inserting", async () => {
    const store = new InMemoryMintStore();
    await store.insertOrganizationDataKey({
      id: "odk_existing",
      organizationId: ORG,
      keyVersion: 1,
      wrappedStorageRef: "inline:b64:existing-org",
      rootKeyVersion: 1,
    });
    const { db, executed } = recordingDb();

    const ref = await persistOrganizationDataKeyAuthoritative(db, store, {
      organizationId: ORG,
      keyVersion: 1,
      rootKeyVersion: 1,
      wrappedStorageRef: "inline:b64:loser",
      rowId: "odk_loser",
    });

    expect(ref).toBe("inline:b64:existing-org");
    expect(executed).toHaveLength(1);
  });

  it("returns the committed project wrapped ref after insert", async () => {
    const store = new InMemoryMintStore();
    const { db, executed } = recordingDb();
    const ref = await persistProjectDataKeyAuthoritative(db, store, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
      organizationDataKeyVersion: 2,
      wrappedStorageRef: "inline:b64:new-project",
      rowId: "pdk_new",
    });

    expect(ref).toBe("inline:b64:new-project");
    expect(executed).toHaveLength(1);
    const row = await store.getProjectDataKeyVersion(ORG, PROJECT, 1);
    expect(row?.organizationDataKeyVersion).toBe(2);
  });
});
