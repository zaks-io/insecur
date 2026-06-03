import { configureKeyring, createKeyring, resetKeyringForTests } from "@insecur/crypto";
import {
  VALIDATION_ERROR_CODES,
  brandValue,
  environmentId,
  organizationId,
  projectId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretWriteError } from "../src/secret-write-error.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";

vi.mock("../src/persist-non-protected-write.js", () => ({
  persistNonProtectedWrite: vi.fn(),
}));

import { persistNonProtectedWrite } from "../src/persist-non-protected-write.js";

const persistMock = vi.mocked(persistNonProtectedWrite);

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describe("writeNonProtectedSecret variable key validation", () => {
  beforeEach(() => {
    resetKeyringForTests();
    configureKeyring(createKeyring(createTestRootKey()));
    persistMock.mockReset();
  });

  afterEach(() => {
    resetKeyringForTests();
  });

  it("rejects cast invalid Variable Keys before persistence", async () => {
    const forgedKey = brandValue<string, "VariableKey">("not-a-valid-key");

    await expect(
      writeNonProtectedSecret({
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        projectId: projectId.brand("prj_00000000000000000000000001"),
        environmentId: environmentId.brand("env_00000000000000000000000001"),
        variableKey: forgedKey,
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        valueUtf8: new TextEncoder().encode("secret-value"),
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
    });

    expect(persistMock).not.toHaveBeenCalled();
  });

  it("throws SecretWriteError without echoing the secret value", async () => {
    const sensitive = new TextEncoder().encode("do-not-leak-me");
    const forgedKey = "lowercase_invalid" as VariableKey;

    try {
      await writeNonProtectedSecret({
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        projectId: projectId.brand("prj_00000000000000000000000001"),
        environmentId: environmentId.brand("env_00000000000000000000000001"),
        variableKey: forgedKey,
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        valueUtf8: sensitive,
      });
      expect.fail("expected write to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect(String(error)).not.toContain(new TextDecoder().decode(sensitive));
      expect(String(error)).not.toContain("lowercase_invalid");
    }
  });
});
