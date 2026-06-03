import { describe } from "vitest";
import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";

function runtimeDatabaseUrl(): string | undefined {
  try {
    return requireDatabaseUrl("DATABASE_URL_RUNTIME");
  } catch {
    return undefined;
  }
}

/**
 * Real-Postgres RLS suite entrypoint. Skips locally when DATABASE_URL_RUNTIME is unset;
 * hard-fails when INSECUR_CI_RLS_GATE=1 (postgres-integration job).
 */
export function describeRls(name: string, factory: () => void): void {
  const runtimeUrl = runtimeDatabaseUrl();
  if (process.env.INSECUR_CI_RLS_GATE === "1" && runtimeUrl === undefined) {
    throw new Error(
      "DATABASE_URL_RUNTIME is required for the CI RLS gate (run pnpm dev:db:reset or export repo .env.local)",
    );
  }

  const suite = runtimeUrl === undefined ? describe.skip : describe;
  suite(name, factory);
}

export function getRuntimeDatabaseUrl(): string | undefined {
  return runtimeDatabaseUrl();
}
