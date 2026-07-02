#!/usr/bin/env node

import process from "node:process";

import { runSiteBoundaryConformance } from "./site-boundary-conformance-lib.mjs";

runSiteBoundaryConformance().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
