import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  SECRET_VERSION_LIFECYCLE_STATES,
} from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertSecretSyncBindings } from "../src/assert-secret-sync-bindings.js";
import { SecretSyncError } from "../src/secret-sync-error.js";
import { ENV, ORG, PROJECT, SECRET } from "./helpers/secret-sync-test-fixtures.js";

const { resolveSecretForPolicyBinding, getEnvironmentById, listSecretsByEnvironment } = vi.hoisted(
  () => ({
    resolveSecretForPolicyBinding: vi.fn(async () => undefined),
    getEnvironmentById: vi.fn(),
    listSecretsByEnvironment: vi.fn(),
  }),
);

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run) => run({ db: {} as never })),
    resolveSecretForPolicyBinding,
    TenantEnvironmentLifecycleStore: class {
      getById = getEnvironmentById;
    },
    TenantSecretMatrixMetadataStore: class {
      listByEnvironment = listSecretsByEnvironment;
    },
  };
});

describe("assertSecretSyncBindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentById.mockResolvedValue({ isProtected: false });
    listSecretsByEnvironment.mockResolvedValue([
      { secretId: SECRET, currentLifecycleState: null, currentVersionId: "ver_01" },
    ]);
  });

  it("accepts bindings with a current version in non-protected environments", async () => {
    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).resolves.toBeUndefined();
    expect(resolveSecretForPolicyBinding).toHaveBeenCalled();
  });

  it("requires published versions in protected environments", async () => {
    getEnvironmentById.mockResolvedValue({ isProtected: true });
    listSecretsByEnvironment.mockResolvedValue([
      { secretId: SECRET, currentLifecycleState: "draft", currentVersionId: "ver_01" },
    ]);

    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.sourceValueMissing });
  });

  it("accepts live protected secrets", async () => {
    getEnvironmentById.mockResolvedValue({ isProtected: true });
    listSecretsByEnvironment.mockResolvedValue([
      {
        secretId: SECRET,
        currentLifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live,
        currentVersionId: "ver_01",
      },
    ]);

    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).resolves.toBeUndefined();
  });

  it("maps missing secrets to secretBindingNotFound", async () => {
    listSecretsByEnvironment.mockResolvedValue([]);

    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.secretBindingNotFound });
  });

  it("maps resolveSecretForPolicyBinding not-found errors", async () => {
    resolveSecretForPolicyBinding.mockRejectedValue(new SecretVersionStoreNotFoundError("missing"));

    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).rejects.toBeInstanceOf(SecretSyncError);
  });

  it("maps environment mismatch errors", async () => {
    resolveSecretForPolicyBinding.mockRejectedValue(
      new SecretVersionStoreConflictError("mismatch"),
    );

    await expect(
      assertSecretSyncBindings({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretIds: [SECRET],
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.secretBindingEnvironmentMismatch });
  });
});
