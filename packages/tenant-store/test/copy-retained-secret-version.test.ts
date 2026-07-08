import { organizationId, secretId, secretVersionId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { copyRetainedSecretVersion } from "../src/secrets/copy-retained-secret-version.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "../src/secrets/lifecycle-states.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const NEW_VERSION = secretVersionId.brand("sv_00000000000000000000000002");

vi.mock("../src/secrets/secret-version-append.js", () => ({
  lockSecretForAppend: vi.fn().mockResolvedValue(undefined),
  allocateNextVersionNumber: vi.fn().mockResolvedValue(3),
}));

describe("copyRetainedSecretVersion", () => {
  it("copies ciphertext metadata from a retained version into a new draft", async () => {
    const { db, insertValues } = createMockTenantDb({
      selectResults: [
        [
          {
            id: "sv_00000000000000000000000001",
            versionNumber: 2,
            lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.retained,
            organizationDataKeyVersion: 1,
            projectDataKeyVersion: 1,
            ciphertextStorageRef: "ciphertext-ref",
          },
        ],
      ],
    });

    const result = await copyRetainedSecretVersion(db, {
      organizationId: ORG,
      secretId: SECRET,
      toSourceVersionId: "sv_00000000000000000000000001" as never,
      newSecretVersionId: NEW_VERSION,
      asDraft: true,
    });

    expect(result).toMatchObject({
      secretId: SECRET,
      secretVersionId: NEW_VERSION,
      versionNumber: 3,
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft,
    });
    expect(insertValues[0]).toMatchObject({
      id: NEW_VERSION,
      ciphertextStorageRef: "ciphertext-ref",
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft,
    });
  });
});
