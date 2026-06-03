import { loadRepoEnvLocal, requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";

loadRepoEnvLocal();

if (process.env.INSECUR_CI_RLS_GATE === "1") {
  console.log("[insecur] INSECUR_CI_RLS_GATE=1 (RLS fail-closed active in vitest)");
  requireDatabaseUrl("DATABASE_URL_RUNTIME");
}
