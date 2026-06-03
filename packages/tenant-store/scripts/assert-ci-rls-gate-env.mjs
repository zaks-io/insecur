#!/usr/bin/env node
/**
 * Turbo env probe: confirms INSECUR_CI_RLS_GATE survives strict envMode into task children.
 * Invoked from scripts/ci/postgres-integration-tests.mjs before test:rls / test:e2e.
 */
if (process.env.INSECUR_CI_RLS_GATE !== "1") {
  console.error(
    "RLS gate env probe failed: INSECUR_CI_RLS_GATE is not set in the turbo task process",
  );
  process.exit(1);
}

console.log("OK INSECUR_CI_RLS_GATE=1 reached turbo task process");
