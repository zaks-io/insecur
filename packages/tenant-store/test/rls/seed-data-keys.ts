import { organizationId, projectId } from "@insecur/domain";
import type postgres from "postgres";

import type {
  SeedOrganizationDataKeyInput,
  SeedProjectDataKeyInput,
} from "../../src/data-keys/types.js";
import { TEST_INSTANCE_ID } from "./test-ids.js";

interface SeedDataKeysInput {
  organizationId: string;
  projectId: string;
  organizationDataKeyId: string;
  projectDataKeyId: string;
}

async function insertOrganizationDataKey(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  const orgKey: SeedOrganizationDataKeyInput = {
    id: input.organizationDataKeyId,
    organizationId: organizationId.brand(input.organizationId),
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 1,
    wrappedStorageRef: `secrets-store://org/${input.organizationId}/odk/v1`,
    custodyEvidenceRef: `escrow-record://instance/${TEST_INSTANCE_ID}/root/v1`,
  };
  await tx`
    INSERT INTO organization_data_keys (
      id,
      org_id,
      key_version,
      status,
      root_key_version,
      wrapped_storage_ref,
      custody_evidence_ref
    )
    VALUES (
      ${orgKey.id},
      ${orgKey.organizationId},
      ${orgKey.keyVersion},
      ${orgKey.status},
      ${orgKey.rootKeyVersion},
      ${orgKey.wrappedStorageRef},
      ${orgKey.custodyEvidenceRef}
    )
    ON CONFLICT (org_id, key_version) DO NOTHING
  `;
}

async function insertProjectDataKey(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  const projectKey: SeedProjectDataKeyInput = {
    id: input.projectDataKeyId,
    organizationId: organizationId.brand(input.organizationId),
    projectId: projectId.brand(input.projectId),
    keyVersion: 1,
    organizationDataKeyVersion: 1,
    status: "active",
    wrappedStorageRef: `secrets-store://org/${input.organizationId}/prj/${input.projectId}/pdk/v1`,
  };
  await tx`
    INSERT INTO project_data_keys (
      id,
      org_id,
      project_id,
      key_version,
      status,
      organization_data_key_version,
      wrapped_storage_ref
    )
    VALUES (
      ${projectKey.id},
      ${projectKey.organizationId},
      ${projectKey.projectId},
      ${projectKey.keyVersion},
      ${projectKey.status},
      ${projectKey.organizationDataKeyVersion},
      ${projectKey.wrappedStorageRef}
    )
    ON CONFLICT (project_id, key_version) DO NOTHING
  `;
}

export async function seedDataKeys(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  await insertOrganizationDataKey(tx, input);
  await insertProjectDataKey(tx, input);
}
