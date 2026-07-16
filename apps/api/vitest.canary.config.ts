import { defineDbSuiteConfig } from "./test/support/db-suite-config.js";

// No-plaintext canary gate: real Worker routes, migration-role Postgres sweep, console capture.
// console-capture.test.ts runs in the worker unit suite (vitest.config.ts) — keep it out of this
// DB-backed gate so coverage and runtime are not duplicated.
export default defineDbSuiteConfig({
  include: ["test/canary/**/*.test.ts"],
  exclude: ["test/canary/console-capture.test.ts"],
  hookTimeout: 120_000,
  testTimeout: 120_000,
});
