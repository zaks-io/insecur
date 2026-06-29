import { afterAll, expect, it } from "vitest";

import {
  closeRuntimeSql,
  runWithRuntimeConnection,
  withTenantScope,
  type TenantScopedHandles,
} from "../../src/index.js";
import { describeRls, getRuntimeDatabaseUrl } from "./describe-rls.js";

const runtimeUrl = getRuntimeDatabaseUrl();

/** Inner transaction opened from inside the outer one — the nesting that deadlocks at max:1. */
async function readInnerScopedValue(): Promise<number | undefined> {
  return withTenantScope({ kind: "service" }, async ({ sql }: TenantScopedHandles) => {
    const [row] = await sql<{ ok: number }[]>`select 2 as ok`;
    return row?.ok;
  });
}

async function readNestedScopedValues(): Promise<{ outer?: number; inner?: number }> {
  return withTenantScope({ kind: "service" }, async ({ sql }: TenantScopedHandles) => {
    const [outerRow] = await sql<{ ok: number }[]>`select 1 as ok`;
    const inner = await readInnerScopedValue();
    return { outer: outerRow?.ok, inner };
  });
}

/**
 * Guards the request-scoped Runtime connection (ADR-0077). The Worker opens one client per RPC via
 * `runWithRuntimeConnection`; a single RPC nests `withTenantScope` transactions (secret write opens a
 * transaction, then the keyring reads the wrapped data key in a second transaction inside it). On a
 * one-connection client the nested transaction waits for the connection its ancestor holds and the
 * request hangs until the socket timeout. This proves the request-scoped pool serves nested
 * transactions. The in-process e2e cannot catch this (single Node context, fallback pool), so this
 * real-Postgres test is the regression guard.
 */
describeRls("runtime request-scoped connection (real Postgres)", () => {
  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("serves a nested withTenantScope without deadlocking on the per-request pool", async () => {
    if (!runtimeUrl) {
      return;
    }

    const { result } = await runWithRuntimeConnection(runtimeUrl, readNestedScopedValues);

    expect(result).toEqual({ outer: 1, inner: 2 });
  });
});
