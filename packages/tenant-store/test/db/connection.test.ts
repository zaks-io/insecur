import { STORE_ERROR_CODES } from "@insecur/domain";
import { afterEach, describe, expect, it } from "vitest";

import { getRuntimeSql, RuntimeConfigMissingError } from "../../src/db/connection.js";

describe("tenant-store ErrorBody-compatible failures", () => {
  const previousUrl = process.env.DATABASE_URL_RUNTIME;

  afterEach(() => {
    if (previousUrl === undefined) {
      Reflect.deleteProperty(process.env, "DATABASE_URL_RUNTIME");
    } else {
      process.env.DATABASE_URL_RUNTIME = previousUrl;
    }
  });

  it("RuntimeConfigMissingError carries a known code and retryable flag", () => {
    Reflect.deleteProperty(process.env, "DATABASE_URL_RUNTIME");

    try {
      getRuntimeSql();
      expect.fail("expected runtime config error");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigMissingError);
      expect((error as RuntimeConfigMissingError).code).toBe(
        STORE_ERROR_CODES.runtimeConfigMissing,
      );
      expect((error as RuntimeConfigMissingError).retryable).toBe(false);
      expect((error as RuntimeConfigMissingError).message).not.toContain("DATABASE_URL_RUNTIME");
    }
  });
});
