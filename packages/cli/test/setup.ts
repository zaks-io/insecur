import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const isolatedHome = mkdtempSync(join(tmpdir(), "insecur-cli-test-home-"));

process.env.INSECUR_CONFIG_HOME = isolatedHome;
process.env.HOME = isolatedHome;
