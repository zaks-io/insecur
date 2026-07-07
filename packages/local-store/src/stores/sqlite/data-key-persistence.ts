import { projectId, type ProjectId } from "@insecur/domain";

import type { LocalDataKeyPersistence } from "../../crypto/local-data-key-source.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";

export class SqliteLocalDataKeyPersistence implements LocalDataKeyPersistence {
  constructor(private readonly database: LocalSqliteDatabase) {}

  getOrganizationDataKey(version: number) {
    const row = this.database
      .prepare(
        `SELECT organization_data_key_version, root_key_version, wrapped_storage_ref
         FROM organization_data_keys
         WHERE organization_data_key_version = ?`,
      )
      .get(version) as
      | {
          organization_data_key_version: number;
          root_key_version: number;
          wrapped_storage_ref: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      organizationDataKeyVersion: row.organization_data_key_version,
      rootKeyVersion: row.root_key_version,
      wrappedStorageRef: row.wrapped_storage_ref,
    };
  }

  saveOrganizationDataKey(row: {
    organizationDataKeyVersion: number;
    rootKeyVersion: number;
    wrappedStorageRef: string;
  }): string {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO organization_data_keys
         (organization_data_key_version, root_key_version, wrapped_storage_ref)
         VALUES (?, ?, ?)`,
      )
      .run(row.organizationDataKeyVersion, row.rootKeyVersion, row.wrappedStorageRef);
    return this.requireOrganizationDataKeyRef(row.organizationDataKeyVersion);
  }

  getProjectDataKey(projectIdValue: ProjectId, version: number) {
    const row = this.database
      .prepare(
        `SELECT project_id, project_data_key_version, root_key_version, wrapped_storage_ref
         FROM project_data_keys
         WHERE project_id = ? AND project_data_key_version = ?`,
      )
      .get(projectIdValue, version) as
      | {
          project_id: string;
          project_data_key_version: number;
          root_key_version: number;
          wrapped_storage_ref: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      projectId: projectId.brand(row.project_id),
      projectDataKeyVersion: row.project_data_key_version,
      rootKeyVersion: row.root_key_version,
      wrappedStorageRef: row.wrapped_storage_ref,
    };
  }

  saveProjectDataKey(row: {
    projectId: ProjectId;
    projectDataKeyVersion: number;
    rootKeyVersion: number;
    wrappedStorageRef: string;
  }): string {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO project_data_keys
         (project_id, project_data_key_version, root_key_version, wrapped_storage_ref)
         VALUES (?, ?, ?, ?)`,
      )
      .run(row.projectId, row.projectDataKeyVersion, row.rootKeyVersion, row.wrappedStorageRef);
    return this.requireProjectDataKeyRef(row.projectId, row.projectDataKeyVersion);
  }

  private requireOrganizationDataKeyRef(version: number): string {
    const persisted = this.getOrganizationDataKey(version);
    if (!persisted) {
      throw new Error("organization data key was not persisted");
    }
    return persisted.wrappedStorageRef;
  }

  private requireProjectDataKeyRef(projectIdValue: ProjectId, version: number): string {
    const persisted = this.getProjectDataKey(projectIdValue, version);
    if (!persisted) {
      throw new Error("project data key was not persisted");
    }
    return persisted.wrappedStorageRef;
  }
}
