import { STORE_ERROR_CODES } from "@insecur/domain";
import { afterEach, describe, expect, it } from "vitest";

import {
  activeRuntimeConnection,
  closeRuntimeSql,
  configureRuntimeConnection,
  getRuntimeSql,
  runWithRuntimeConnection,
  RuntimeConfigMissingError,
} from "../../src/db/connection.js";

describe("tenant-store ErrorBody-compatible failures", () => {
  const previousUrl = process.env.DATABASE_URL_RUNTIME;

  afterEach(async () => {
    await closeRuntimeSql();
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

  it("configured connection string wins over process.env and resets after close", async () => {
    // Distinct hosts so the resolved pool's options reveal which source won. postgres() is lazy and
    // never connects here (no query runs), so a bogus host is safe — we only inspect parsed options.
    process.env.DATABASE_URL_RUNTIME = "postgres://env:env@env-host:5432/db";
    configureRuntimeConnection("postgres://ctx:ctx@ctx-host:5432/db");

    const sql = getRuntimeSql();
    // postgres() parses host into an array; one entry, the configured host.
    expect(sql.options.host).toEqual(["ctx-host"]);
    // Same isolate, same string → idempotent, no throw.
    expect(() => configureRuntimeConnection("postgres://ctx:ctx@ctx-host:5432/db")).not.toThrow();

    await closeRuntimeSql();

    // After close the configured string is cleared, so resolution falls back to process.env.
    const fallback = getRuntimeSql();
    expect(fallback.options.host).toEqual(["env-host"]);
  });

  it("fails loud when the connection string changes after the pool is created", () => {
    process.env.DATABASE_URL_RUNTIME = "postgres://env:env@env-host:5432/db";
    configureRuntimeConnection("postgres://ctx:ctx@first-host:5432/db");
    getRuntimeSql();

    expect(() => configureRuntimeConnection("postgres://ctx:ctx@second-host:5432/db")).toThrow(
      "runtime connection string changed after pool creation",
    );
  });

  it("an empty connection string is a config-missing failure", () => {
    expect(() => configureRuntimeConnection("")).toThrow(RuntimeConfigMissingError);
  });
});

describe("runWithRuntimeConnection", () => {
  it("opens a request-scoped client that getRuntimeSql resolves, then closes the socket after", async () => {
    // postgres() is lazy and never connects (no query runs), so a bogus host is safe.
    const connStr = "postgres://req:req@req-host:5432/db";

    const { result, closing } = await runWithRuntimeConnection(connStr, async () => {
      const scoped = getRuntimeSql();
      expect(scoped.options.host).toEqual(["req-host"]);
      // Small per-request pool (>1) so sequential withTenantScope transactions in one RPC do not
      // starve a single connection; Hyperdrive pools server-side so this stays cheap.
      expect(scoped.options.max).toBe(5);
      // The active connection is exactly the scoped client.
      expect(activeRuntimeConnection()?.sql).toBe(scoped);
      return "ok";
    });

    expect(result).toBe("ok");
    await expect(closing).resolves.toBeUndefined();
    // Outside the scope there is no active connection (no cross-request leak).
    expect(activeRuntimeConnection()).toBeUndefined();
  });

  it("closes the client and rethrows when the body throws", async () => {
    const connStr = "postgres://req:req@throw-host:5432/db";
    await expect(
      runWithRuntimeConnection(connStr, async () => {
        throw new Error("body failed");
      }),
    ).rejects.toThrow("body failed");
    expect(activeRuntimeConnection()).toBeUndefined();
  });

  it("an empty connection string is a config-missing failure", async () => {
    await expect(runWithRuntimeConnection("", async () => "x")).rejects.toBeInstanceOf(
      RuntimeConfigMissingError,
    );
  });
});
