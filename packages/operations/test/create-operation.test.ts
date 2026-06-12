import { organizationId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
}));

vi.mock("../src/tenant-operation-store.js", () => ({
  generateOperationId: vi.fn(),
  TenantOperationStore: vi.fn(),
}));

import { withTenantScope } from "@insecur/tenant-store";
import { createOperation } from "../src/create-operation.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";

const ORG = organizationId.brand("org_00000000000000000000000001");

const withTenantScopeMock = vi.mocked(withTenantScope);

describe("createOperation intent validation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unregistered intent codes before persistence", async () => {
    await expect(
      createOperation({
        organizationId: ORG,
        intentCode: "sync.not_registered",
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidIntent,
      message: "unknown intentCode: sync.not_registered",
    });

    expect(withTenantScopeMock).not.toHaveBeenCalled();
  });
});
