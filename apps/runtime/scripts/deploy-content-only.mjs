#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { runCliMain } from "../../../scripts/cli-exit.mjs";
import { runContentOnlyDeploy } from "./deploy-content-only-lib.mjs";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCliMain(runContentOnlyDeploy);
}
