import { ONBOARDING_ERROR_CODES, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeTenantSql,
  queryIncludes,
} from "../../operations/test/helpers/fake-tenant-sql.js";
import { TEST_INSTANCE_ID, TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";

const withTenantScopeMock = vi.hoisted(() => vi.fn());

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: withTenantScopeMock,
  };
});

import { assertInstanceOperator, isInstanceOperator } from "../src/assert-instance-operator.js";
import { MembershipManagementError } from "../src/membership-management-error.js";

const OPERATOR = userId.brand(TEST_USER_ID);
const NON_OPERATOR = userId.brand("usr_00000000000000000000000002");

function mockInstanceOperatorRows(rows: { user_id: string }[]): void {
  const sql = createFakeTenantSql((query) => {
    if (queryIncludes(query, "from instance_operators")) {
      return rows;
    }
    throw new Error(`unexpected query: ${query}`);
  });
  withTenantScopeMock.mockImplementation(async (_scope, callback) => callback({ sql }));
}

describe("isInstanceOperator", () => {
  beforeEach(() => {
    withTenantScopeMock.mockReset();
  });

  it("returns true when the user has an instance operator grant", async () => {
    mockInstanceOperatorRows([{ user_id: TEST_USER_ID }]);

    await expect(isInstanceOperator(TEST_INSTANCE_ID, OPERATOR)).resolves.toBe(true);
  });

  it("returns false when the user has no instance operator grant", async () => {
    mockInstanceOperatorRows([]);

    await expect(isInstanceOperator(TEST_INSTANCE_ID, NON_OPERATOR)).resolves.toBe(false);
  });
});

describe("assertInstanceOperator", () => {
  beforeEach(() => {
    withTenantScopeMock.mockReset();
  });

  it("throws notInstanceOperator when the user is not an operator", async () => {
    mockInstanceOperatorRows([]);

    await expect(assertInstanceOperator(TEST_INSTANCE_ID, NON_OPERATOR)).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.notInstanceOperator,
    });
    await expect(assertInstanceOperator(TEST_INSTANCE_ID, NON_OPERATOR)).rejects.toBeInstanceOf(
      MembershipManagementError,
    );
  });
});
