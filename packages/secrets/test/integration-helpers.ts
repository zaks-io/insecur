import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  userId,
  type OrganizationId,
  type VariableKey,
} from "@insecur/domain";
import type { WriteNonProtectedSecretResult } from "../src/write-non-protected-secret.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

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

export function writeTestSecret(
  variableKey: VariableKey,
  valueUtf8: Uint8Array,
): Promise<WriteNonProtectedSecretResult> {
  return writeNonProtectedSecret({
    organizationId: testOrganization(),
    projectId: projectId.brand(TEST_PROJECT_A_ID),
    environmentId: environmentId.brand(TEST_ENV_A_ID),
    variableKey,
    actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
    valueUtf8,
  });
}
