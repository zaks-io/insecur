import { defineDbSuiteConfig } from "./test/support/db-suite-config.js";

// End-to-end First Value loop: real Worker routes against real Postgres + crypto.
// load-env.ts hydrates DATABASE_URL* from the repo .env.local; the suite self-gates
// via integrationDatabaseReady and skips cleanly when no runtime DB is configured.
export default defineDbSuiteConfig({
  include: ["test/e2e/**/*.test.ts"],
  hookTimeout: 60_000,
  testTimeout: 30_000,
});
