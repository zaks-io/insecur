import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  userId,
  type OrganizationId,
  type VariableKey,
} from "@insecur/domain";
import { StaticRootKeyProvider } from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-store";
import type { WriteNonProtectedSecretResult } from "../src/write-non-protected-secret.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_BYTES } from "../../tenant-store/test/rls/test-root-key.js";

export function testOrganization(): OrganizationId {
  return organizationId.brand(TEST_ORG_A_ID);
}

export function uniqueVariableKey(prefix: string): VariableKey {
  const parsed = parseVariableKey(`${prefix}_${Date.now()}`);
  if (!parsed.ok) {
    throw new Error("test variable key invalid");
  }
  return parsed.value;
}

export function createTestKeyring() {
  return createTenantBackedKeyring(new StaticRootKeyProvider(RLS_TEST_ROOT_KEY_BYTES));
}

export interface TestSecretTenant {
  readonly organizationId: OrganizationId;
  readonly projectId: string;
  readonly environmentId: string;
}

export function writeTestSecret(
  variableKey: VariableKey,
  valueUtf8: Uint8Array,
  tenant?: TestSecretTenant,
): Promise<WriteNonProtectedSecretResult> {
  return writeNonProtectedSecret({
    keyring: createTestKeyring(),
    organizationId: tenant?.organizationId ?? testOrganization(),
    projectId: projectId.brand(tenant?.projectId ?? TEST_PROJECT_A_ID),
    environmentId: environmentId.brand(tenant?.environmentId ?? TEST_ENV_A_ID),
    variableKey,
    actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
    valueUtf8,
  });
}
