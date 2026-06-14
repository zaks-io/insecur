import { organizationId, projectId } from "@insecur/domain";
import { wrapOrganizationDataKeyBytes, wrapProjectDataKeyBytes } from "@insecur/crypto";
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

const DATA_KEY_LENGTH = 32;

// Seed DEKs are DETERMINISTIC, unlike production mintOrganizationDataKey/mintProjectDataKey which
// generate random DEK bytes. seedTenantBaseline() runs in every DB-backed suite's beforeAll and
// ON CONFLICT DO UPDATEs wrapped_storage_ref. The suites share one local Postgres and turbo runs
// them concurrently, so a random re-mint would swap the DEK out from under a secret another suite
// already wrote -> DecryptError mid-run. Deriving the DEK bytes from the fixed test root key + the
// key identity makes every re-seed byte-identical, so concurrent seeds can never invalidate
// in-flight ciphertext. The wrap IV is still random per call (the wrapped ref bytes differ), but
// the unwrapped DEK is stable, which is all decrypt depends on.
async function deriveSeedDataKeyBytes(label: string): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", RLS_TEST_ROOT_KEY_BYTES, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("insecur:seed-data-key:v1"),
      info: new TextEncoder().encode(label),
    },
    baseKey,
    DATA_KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

async function insertOrganizationDataKey(
  tx: postgres.TransactionSql,
  input: SeedDataKeysInput,
): Promise<void> {
  const brandedOrgId = organizationId.brand(input.organizationId);
  const dataKeyBytes = await deriveSeedDataKeyBytes(`org:${input.organizationId}:v1`);
  const wrappedStorageRef = await wrapOrganizationDataKeyBytes(
    RLS_TEST_ROOT_KEY_BYTES,
    dataKeyBytes,
    { organizationId: brandedOrgId, keyVersion: 1 },
  );
  const orgKey: SeedOrganizationDataKeyInput = {
    id: input.organizationDataKeyId,
    organizationId: brandedOrgId,
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 1,
    wrappedStorageRef,
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
  const dataKeyBytes = await deriveSeedDataKeyBytes(
    `project:${input.organizationId}:${input.projectId}:v1`,
  );
  const wrappedStorageRef = await wrapProjectDataKeyBytes(RLS_TEST_ROOT_KEY_BYTES, dataKeyBytes, {
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
    wrappedStorageRef,
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

export type { SeedDataKeysInput };
export { RLS_TEST_ROOT_KEY_BYTES };
