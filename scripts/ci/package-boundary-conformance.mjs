#!/usr/bin/env node

import process from "node:process";

import { runPackageBoundaryConformance } from "./package-boundary-conformance-lib.mjs";

runPackageBoundaryConformance().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
