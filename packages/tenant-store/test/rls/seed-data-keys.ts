import { organizationId, projectId } from "@insecur/domain";
import {
  mintOrganizationDataKey,
  mintProjectDataKey,
  StaticRootKeyProvider,
} from "@insecur/crypto";
import type postgres from "postgres";

import type {
  SeedOrganizationDataKeyInput,
  SeedProjectDataKeyInput,
} from "../../src/data-keys/types.js";
import { TEST_INSTANCE_ID } from "./test-ids.js";
import { RLS_TEST_ROOT_KEY_BYTES } from "./test-root-key.js";

interface SeedDataKeysInput {
  organizationId: string;
  projectId: string;
  organizationDataKeyId: string;
  projectDataKeyId: string;
}

const rootKeyProvider = new StaticRootKeyProvider(RLS_TEST_ROOT_KEY_BYTES);

async function insertOrganizationDataKey(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  const brandedOrgId = organizationId.brand(input.organizationId);
  const minted = await mintOrganizationDataKey(rootKeyProvider, 1, {
    organizationId: brandedOrgId,
    keyVersion: 1,
  });
  const orgKey: SeedOrganizationDataKeyInput = {
    id: input.organizationDataKeyId,
    organizationId: brandedOrgId,
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 1,
    wrappedStorageRef: minted.wrappedStorageRef,
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
    ON CONFLICT (org_id, key_version) DO UPDATE SET
      status = EXCLUDED.status,
      root_key_version = EXCLUDED.root_key_version,
      wrapped_storage_ref = EXCLUDED.wrapped_storage_ref,
      custody_evidence_ref = EXCLUDED.custody_evidence_ref,
      updated_at = now()
  `;
}

async function insertProjectDataKey(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  const brandedOrgId = organizationId.brand(input.organizationId);
  const brandedProjectId = projectId.brand(input.projectId);
  const minted = await mintProjectDataKey(rootKeyProvider, 1, {
    organizationId: brandedOrgId,
    projectId: brandedProjectId,
    keyVersion: 1,
  });
  const projectKey: SeedProjectDataKeyInput = {
    id: input.projectDataKeyId,
    organizationId: brandedOrgId,
    projectId: brandedProjectId,
    keyVersion: 1,
    organizationDataKeyVersion: 1,
    status: "active",
    wrappedStorageRef: minted.wrappedStorageRef,
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
    ON CONFLICT (project_id, key_version) DO UPDATE SET
      status = EXCLUDED.status,
      organization_data_key_version = EXCLUDED.organization_data_key_version,
      wrapped_storage_ref = EXCLUDED.wrapped_storage_ref,
      updated_at = now()
  `;
}

export async function seedDataKeys(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  await insertOrganizationDataKey(tx, input);
  await insertProjectDataKey(tx, input);
}

export { RLS_TEST_ROOT_KEY_BYTES };
