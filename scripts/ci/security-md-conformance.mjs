#!/usr/bin/env node
// SECURITY.md endpoint-scope conformance gate. SECURITY.md summarizes the public surface for
// vulnerability reporters, but the owning doc is the generated docs/specs/deploy-route-inventory.md
// (ADR-0067). This gate fails when the SECURITY.md "Public Endpoint Scope" table or the
// organization-qualified API-groups sentence drifts from that inventory, so the reporter-facing
// scope can never silently rot. Wired into `pnpm verify` via verify:policy.

import process from "node:process";

import { runSecurityMdConformance } from "./security-md-conformance-lib.mjs";

try {
  runSecurityMdConformance();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
