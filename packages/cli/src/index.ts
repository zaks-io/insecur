#!/usr/bin/env node
import { createCliCrashReporter } from "./crash-reporting.js";
import { runCli } from "./program.js";

const crashReporter = await createCliCrashReporter({ argv: process.argv });

const exitCode = await runCli(process.argv, { crashReporter });
process.exitCode = exitCode;
