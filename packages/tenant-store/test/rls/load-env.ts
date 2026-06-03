import { loadRepoEnvLocal, requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";

loadRepoEnvLocal();

if (process.env.INSECUR_CI_RLS_GATE === "1") {
  requireDatabaseUrl("DATABASE_URL_RUNTIME");
}
